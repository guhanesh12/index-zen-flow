/**
 * 🔀 MULTI-BROKER ORDER ROUTER (Dhan + Zerodha Kite)
 *
 * Purpose: one entry point that places an order with whichever broker the user
 * has selected, WITHOUT changing any existing Dhan behaviour.
 *
 *   activeBroker === 'dhan'    → existing placeOrderViaStaticIP() path (unchanged)
 *   activeBroker === 'zerodha' → same dedicated static-IP VPS (/place-order-kite),
 *                                with a direct Kite API fallback when the VPS
 *                                image is older than v1.2.0.
 *
 * Zerodha credentials live in KV (`kite_credentials:{userId}`) exactly like the
 * Dhan ones (`api_credentials:{userId}`); `broker_credentials` only keeps the
 * non-secret status mirror used by the UI.
 */

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import * as kv from "./kv_store.tsx";
import { placeOrderViaStaticIP, getUserOrderPlacementIP } from "./static_ip_helper.tsx";
import {
  KiteService,
  buildKiteTradingSymbol,
  kiteExchangeFromSegment,
} from "./kite_service.tsx";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
);

export type BrokerId = "dhan" | "zerodha";

export interface KiteStoredCreds {
  apiKey: string;
  apiSecret: string;
  accessToken?: string;
  kiteUserId?: string;
  kiteUserName?: string;
  tokenExpiry?: string;
  redirectUrl?: string;
}

// ───────────────────────── active broker ─────────────────────────

export async function getActiveBroker(userId: string): Promise<BrokerId> {
  try {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("active_broker")
      .eq("user_id", userId)
      .maybeSingle();
    return String(data?.active_broker || "dhan").toLowerCase() === "zerodha" ? "zerodha" : "dhan";
  } catch {
    return "dhan";
  }
}

export async function setActiveBroker(userId: string, broker: BrokerId): Promise<void> {
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ active_broker: broker })
    .eq("user_id", userId);
  if (error) throw error;
}

// ───────────────────────── kite credentials ─────────────────────────

export async function getKiteCredentials(userId: string): Promise<KiteStoredCreds | null> {
  const creds = (await kv.get(`kite_credentials:${userId}`)) as KiteStoredCreds | null;
  if (!creds?.apiKey) return null;
  return creds;
}

export async function saveKiteCredentials(userId: string, patch: Partial<KiteStoredCreds>) {
  const existing = (await getKiteCredentials(userId)) || ({} as KiteStoredCreds);
  const merged = { ...existing, ...patch };
  await kv.set(`kite_credentials:${userId}`, merged);
  return merged;
}

export async function clearKiteCredentials(userId: string) {
  await kv.del(`kite_credentials:${userId}`);
}

export async function getKiteService(userId: string): Promise<KiteService | null> {
  const creds = await getKiteCredentials(userId);
  if (!creds?.apiKey || !creds?.accessToken) return null;
  return new KiteService({ apiKey: creds.apiKey, accessToken: creds.accessToken });
}

/** Non-secret mirror so the Broker screen can show status for both brokers. */
export async function mirrorKiteStatus(userId: string, patch: Record<string, any>) {
  try {
    const { data: existing } = await supabaseAdmin
      .from("broker_credentials")
      .select("id")
      .eq("user_id", userId)
      .eq("broker", "zerodha")
      .maybeSingle();
    const payload = { user_id: userId, broker: "zerodha", auth_method: "api_key", ...patch };
    if (existing?.id) {
      await supabaseAdmin.from("broker_credentials").update(payload).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("broker_credentials").insert(payload);
    }
  } catch (e) {
    console.error("[KITE] status mirror failed:", (e as any)?.message || e);
  }
}

// ───────────────── tradingsymbol resolution (Dhan → Kite) ─────────────────

/**
 * Our engine speaks Dhan securityIds. Kite speaks tradingsymbols, so resolve the
 * contract from `instrument_master` and rebuild it in Zerodha's format.
 */
export async function resolveKiteSymbol(order: any): Promise<{
  tradingsymbol: string;
  exchange: "NFO" | "BFO";
  lotSize: number;
} | null> {
  if (order?.tradingsymbol) {
    return {
      tradingsymbol: String(order.tradingsymbol),
      exchange: kiteExchangeFromSegment(order.exchangeSegment),
      lotSize: Number(order.lotSize || 0),
    };
  }

  const securityId = String(order?.securityId || "");
  if (!securityId) return null;

  const { data: inst } = await supabaseAdmin
    .from("instrument_master")
    .select("index_name, strike_price, option_type, expiry_date, lot_size, exchange_segment")
    .eq("security_id", securityId)
    .maybeSingle();
  if (!inst) return null;

  // Monthly contracts use MMM (AUG), weeklies use the compact month-code format.
  const expiry = String(inst.expiry_date);
  const monthPrefix = expiry.slice(0, 7);
  const { data: sameMonth } = await supabaseAdmin
    .from("instrument_master")
    .select("expiry_date")
    .eq("index_name", inst.index_name)
    .gte("expiry_date", `${monthPrefix}-01`)
    .lte("expiry_date", `${monthPrefix}-31`)
    .order("expiry_date", { ascending: false })
    .limit(1);
  const lastExpiryOfMonth = sameMonth?.[0]?.expiry_date || expiry;
  const isMonthly = String(lastExpiryOfMonth) === expiry;

  return {
    tradingsymbol: buildKiteTradingSymbol({
      indexName: String(inst.index_name),
      expiryDate: expiry,
      strike: Number(inst.strike_price),
      optionType: String(inst.option_type).toUpperCase() === "PE" ? "PE" : "CE",
      isMonthly,
    }),
    exchange: kiteExchangeFromSegment(inst.exchange_segment || order?.exchangeSegment),
    lotSize: Number(inst.lot_size || 0),
  };
}

// ───────────────────────── Kite order via static IP ─────────────────────────

async function placeKiteOrderViaStaticIP(
  userId: string,
  creds: KiteStoredCreds,
  kiteOrder: { tradingsymbol: string; exchange: string; transactionType: string; quantity: number; tag?: string },
): Promise<any | null> {
  const ORDER_SERVER_API_KEY = Deno.env.get("ORDER_SERVER_API_KEY");
  if (!ORDER_SERVER_API_KEY) return null;

  let ip: string;
  try {
    ip = (await getUserOrderPlacementIP(userId)).ipAddress;
  } catch (e) {
    console.warn("[KITE] no dedicated IP available, falling back to direct API:", (e as any)?.message || e);
    return null;
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let resp: Response;
    try {
      resp = await fetch(`http://${ip}:3000/place-order-kite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ORDER_SERVER_API_KEY}` },
        body: JSON.stringify({
          userId,
          apiKey: creds.apiKey,
          accessToken: creds.accessToken,
          orderDetails: kiteOrder,
        }),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (resp.status === 404) {
      console.warn(`[KITE] VPS ${ip} has no /place-order-kite (older image) → direct API fallback`);
      return null;
    }

    const text = await resp.text();
    let json: any = {};
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!resp.ok || json?.status === "error") {
      const msg = json?.message || json?.error?.message || json?.error || text.slice(0, 300);
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }

    const orderId = json?.data?.order_id || json?.order_id || json?.orderId || null;
    return {
      success: !!orderId,
      orderId: orderId ? String(orderId) : null,
      orderStatus: orderId ? "PLACED" : "REJECTED",
      broker: "zerodha",
      routedVia: `static-ip:${ip}`,
      message: orderId ? "Order placed via Zerodha Kite (dedicated IP)" : "Kite order rejected",
      raw: json,
    };
  } catch (e: any) {
    if (e?.name === "AbortError" || /fetch|network|connect/i.test(e?.message || "")) {
      console.warn(`[KITE] VPS ${ip} unreachable → direct API fallback:`, e?.message);
      return null;
    }
    throw e;
  }
}

// ───────────────────────── public API ─────────────────────────

/**
 * Broker-aware order placement.
 * Drop-in replacement for placeOrderViaStaticIP() — same arguments, same shape out.
 */
export async function placeOrderSmart(
  userId: string,
  dhanCredentials: { dhanClientId: string; dhanAccessToken: string },
  orderDetails: any,
): Promise<any> {
  const broker = await getActiveBroker(userId);

  if (broker !== "zerodha") {
    return await placeOrderViaStaticIP(userId, dhanCredentials, orderDetails);
  }

  const creds = await getKiteCredentials(userId);
  if (!creds?.apiKey || !creds?.accessToken) {
    const err: any = new Error(
      "TOKEN_EXPIRED:Zerodha is your active broker but no valid Kite session was found. Open Broker Setup → Zerodha and login again.",
    );
    err.code = "TOKEN_EXPIRED";
    throw err;
  }

  const resolved = await resolveKiteSymbol(orderDetails);
  if (!resolved?.tradingsymbol) {
    throw new Error("Could not map this contract to a Zerodha tradingsymbol. Refresh the instrument master and retry.");
  }

  const kiteOrder = {
    tradingsymbol: resolved.tradingsymbol,
    exchange: resolved.exchange,
    transactionType: String(orderDetails.transactionType || "BUY").toUpperCase(),
    quantity: Math.max(1, Number(orderDetails.quantity) || 0),
    tag: "indexpilot",
  };

  // 1️⃣ Preferred: same dedicated static IP already purchased for Dhan.
  const viaIp = await placeKiteOrderViaStaticIP(userId, creds, kiteOrder);
  if (viaIp) return viaIp;

  // 2️⃣ Fallback: direct Kite API from the edge (Kite does not require IP whitelisting).
  const svc = new KiteService({ apiKey: creds.apiKey, accessToken: creds.accessToken });
  try {
    const res = await svc.placeOrder({
      tradingsymbol: kiteOrder.tradingsymbol,
      exchange: kiteOrder.exchange as "NFO" | "BFO",
      transactionType: kiteOrder.transactionType as "BUY" | "SELL",
      quantity: kiteOrder.quantity,
      product: "MIS",
      orderType: "MARKET",
      validity: "DAY",
      tag: kiteOrder.tag,
    });
    return {
      success: !!res.orderId,
      orderId: res.orderId,
      orderStatus: res.orderId ? "PLACED" : "REJECTED",
      broker: "zerodha",
      routedVia: "edge",
      message: res.orderId ? "Order placed via Zerodha Kite" : "Kite order rejected",
      raw: res.raw,
    };
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (/token|session|api_key/i.test(msg)) {
      const err: any = new Error(
        `TOKEN_EXPIRED:Your Zerodha session has expired (Kite tokens reset daily at 6 AM). Login again from Broker Setup → Zerodha.`,
      );
      err.code = "TOKEN_EXPIRED";
      throw err;
    }
    throw new Error(msg);
  }
}

/** Broker-aware positions (same shape as DhanService.getPositions()). */
export async function getPositionsSmart(
  userId: string,
  dhanFetch: () => Promise<any[]>,
): Promise<any[]> {
  const broker = await getActiveBroker(userId);
  if (broker !== "zerodha") return await dhanFetch();
  const svc = await getKiteService(userId);
  if (!svc) return [];
  try {
    return await svc.getPositions();
  } catch (e) {
    console.error("[KITE] positions failed:", (e as any)?.message || e);
    return [];
  }
}

/** Broker-aware funds. */
export async function getFundsSmart(
  userId: string,
  dhanFetch: () => Promise<any>,
): Promise<any> {
  const broker = await getActiveBroker(userId);
  if (broker !== "zerodha") return await dhanFetch();
  const svc = await getKiteService(userId);
  if (!svc) return null;
  try {
    return await svc.getFundLimits();
  } catch (e) {
    console.error("[KITE] funds failed:", (e as any)?.message || e);
    return null;
  }
}
