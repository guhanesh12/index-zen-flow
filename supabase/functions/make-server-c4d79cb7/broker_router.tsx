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
  kiteProductFromDhan,
} from "./kite_service.tsx";
import { ensureKiteInstruments } from "./kite_instruments.tsx";
import {
  GrowwService,
  growwExchangeFromSegment,
  growwProductFromDhan,
} from "./groww_service.tsx";
import { ensureGrowwInstruments } from "./groww_instruments.tsx";


const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
);

export type BrokerId = "dhan" | "zerodha" | "groww";
const KNOWN_BROKERS: BrokerId[] = ["dhan", "zerodha", "groww"];


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
    const b = String(data?.active_broker || "dhan").toLowerCase() as BrokerId;
    return KNOWN_BROKERS.includes(b) ? b : "dhan";
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

/** Wipe one broker's stored session (KV secret + non-secret mirror row). */
async function clearBrokerSession(userId: string, broker: BrokerId) {
  if (broker === "dhan") await kv.del(`api_credentials:${userId}`);
  if (broker === "zerodha") await clearKiteCredentials(userId);
  if (broker === "groww") await clearGrowwCredentials(userId);
  await supabaseAdmin
    .from("broker_credentials")
    .delete()
    .eq("user_id", userId)
    .eq("broker", broker);
}

/**
 * ONE USER = ONE BROKER.
 * Selecting a broker makes it active AND removes every other broker's session so
 * orders, funds and positions can never come from two places at once.
 */
export async function selectBroker(userId: string, broker: BrokerId): Promise<void> {
  for (const other of KNOWN_BROKERS) {
    if (other !== broker) await clearBrokerSession(userId, other);
  }
  await supabaseAdmin
    .from("profiles")
    .update({ active_broker: broker, broker_connected: false })
    .eq("user_id", userId);

  // 📥 Download the broker's near-expiry NIFTY/BANKNIFTY/SENSEX contracts so
  // orders go out in that broker's own symbol format (shared by all users).
  if (broker === "zerodha") await ensureKiteInstruments(false);
  if (broker === "groww") await ensureGrowwInstruments(false);
}

// ───────────────────────── groww credentials ─────────────────────────

export interface GrowwStoredCreds {
  accessToken: string;
  growwUserId?: string;
  tokenExpiry?: string;
  lastStatus?: string;
  lastError?: string | null;
}

export async function getGrowwCredentials(userId: string): Promise<GrowwStoredCreds | null> {
  const creds = (await kv.get(`groww_credentials:${userId}`)) as GrowwStoredCreds | null;
  if (!creds?.accessToken) return null;
  return creds;
}

export async function saveGrowwCredentials(userId: string, patch: Partial<GrowwStoredCreds>) {
  const existing = (await getGrowwCredentials(userId)) || ({} as GrowwStoredCreds);
  const merged = { ...existing, ...patch };
  await kv.set(`groww_credentials:${userId}`, merged);
  return merged;
}

export async function clearGrowwCredentials(userId: string) {
  await kv.del(`groww_credentials:${userId}`);
}

export async function getGrowwService(userId: string): Promise<GrowwService | null> {
  const creds = await getGrowwCredentials(userId);
  if (!creds?.accessToken) return null;
  return new GrowwService({ accessToken: creds.accessToken });
}

/** Non-secret mirror so the Broker screen can show Groww status. */
export async function mirrorGrowwStatus(userId: string, patch: Record<string, any>) {
  try {
    const { data: existing } = await supabaseAdmin
      .from("broker_credentials")
      .select("id")
      .eq("user_id", userId)
      .eq("broker", "groww")
      .maybeSingle();
    const payload = { user_id: userId, broker: "groww", auth_method: "access_token", ...patch };
    if (existing?.id) {
      await supabaseAdmin.from("broker_credentials").update(payload).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("broker_credentials").insert(payload);
    }
  } catch (e) {
    console.error("[GROWW] status mirror failed:", (e as any)?.message || e);
  }
}

/** Resolve a Dhan-style order into a Groww trading symbol. */
export async function resolveGrowwSymbol(order: any): Promise<{
  tradingSymbol: string;
  exchange: "NSE" | "BSE";
  segment: "FNO" | "CASH";
  lotSize: number;
} | null> {
  const securityId = String(order?.securityId || "");
  const symbolText = String(order?.symbol || order?.tradingSymbol || "").trim();
  const COLS =
    "lot_size, exchange_segment, groww_trading_symbol, groww_exchange, groww_segment";

  const lookup = async (): Promise<any> => {
    let inst: any = null;
    if (securityId) {
      const { data } = await supabaseAdmin
        .from("instrument_master")
        .select(COLS)
        .eq("security_id", securityId)
        .maybeSingle();
      inst = data;
    }
    if (!inst && symbolText) {
      const { data } = await supabaseAdmin
        .from("instrument_master")
        .select(COLS)
        .or(`symbol.eq.${symbolText},groww_trading_symbol.eq.${symbolText.toUpperCase()}`)
        .maybeSingle();
      inst = data;
    }
    return inst;
  };

  let inst = await lookup();
  if (!inst?.groww_trading_symbol) {
    await ensureGrowwInstruments(!!inst);
    const retry = await lookup();
    if (retry?.groww_trading_symbol) inst = retry;
  }

  if (!inst?.groww_trading_symbol) {
    if (!symbolText) return null;
    const fallback = growwExchangeFromSegment(order?.exchangeSegment);
    return {
      tradingSymbol: symbolText.toUpperCase(),
      exchange: fallback.exchange,
      segment: fallback.segment,
      lotSize: Number(order?.lotSize || 0),
    };
  }

  const exch = String(inst.groww_exchange || "").toUpperCase() === "BSE" ? "BSE" : "NSE";
  const seg = String(inst.groww_segment || "FNO").toUpperCase() === "CASH" ? "CASH" : "FNO";
  return {
    tradingSymbol: String(inst.groww_trading_symbol).toUpperCase(),
    exchange: exch as "NSE" | "BSE",
    segment: seg as "FNO" | "CASH",
    lotSize: Number(inst.lot_size || 0),
  };
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
  const symbolText = String(order?.symbol || order?.tradingSymbol || "").trim();
  const COLS =
    "index_name, strike_price, option_type, expiry_date, lot_size, exchange_segment, kite_tradingsymbol, kite_exchange";

  const lookup = async (): Promise<any> => {
    let inst: any = null;
    if (securityId) {
      const { data } = await supabaseAdmin
        .from("instrument_master")
        .select(COLS)
        .eq("security_id", securityId)
        .maybeSingle();
      inst = data;
    }
    // Exits of Kite-native positions carry a tradingsymbol/symbol instead of a Dhan id.
    if (!inst && symbolText) {
      const { data } = await supabaseAdmin
        .from("instrument_master")
        .select(COLS)
        .or(`symbol.eq.${symbolText},kite_tradingsymbol.eq.${symbolText.toUpperCase()}`)
        .maybeSingle();
      inst = data;
    }
    return inst;
  };

  let inst = await lookup();

  // Contract known to Dhan but not yet mapped to Zerodha → pull the Kite dump now.
  if (!inst || !inst.kite_tradingsymbol) {
    await ensureKiteInstruments(!!inst); // force when the row exists but lacks the mapping
    const retry = await lookup();
    if (retry?.kite_tradingsymbol) inst = retry;
    else inst = inst || retry;
  }

  if (!inst) {
    // Already a Zerodha-format symbol (e.g. NIFTY25AUG25000CE) → use it as-is.
    if (/^[A-Z]+\d{2}[A-Z0-9]{3,5}\d+(CE|PE)$/.test(symbolText.toUpperCase())) {
      return {
        tradingsymbol: symbolText.toUpperCase(),
        exchange: kiteExchangeFromSegment(order?.exchangeSegment),
        lotSize: Number(order?.lotSize || 0),
      };
    }
    return null;
  }

  // ✅ Preferred: the exact tradingsymbol Zerodha published for this contract.
  if (inst.kite_tradingsymbol) {
    return {
      tradingsymbol: String(inst.kite_tradingsymbol).toUpperCase(),
      exchange: String(inst.kite_exchange || "").toUpperCase() === "BFO"
        ? "BFO"
        : kiteExchangeFromSegment(inst.exchange_segment || order?.exchangeSegment),
      lotSize: Number(inst.lot_size || 0),
    };
  }

  // Fallback: build the symbol ourselves (monthly = MMM, weekly = month-code).
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
  kiteOrder: { tradingsymbol: string; exchange: string; transactionType: string; quantity: number; product?: string; tag?: string },
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
    product: kiteProductFromDhan(orderDetails.productType),
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
      product: kiteOrder.product,
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

/** Broker-aware last traded price for a contract (Dhan securityId or Kite symbol). */
export async function getLtpSmart(
  userId: string,
  order: any,
  dhanFetch: () => Promise<number | null>,
): Promise<number | null> {
  const broker = await getActiveBroker(userId);
  if (broker !== "zerodha") return await dhanFetch();
  const svc = await getKiteService(userId);
  if (!svc) return null;
  const resolved = await resolveKiteSymbol(order);
  if (!resolved) return null;
  return await svc.getLastPrice(resolved.exchange, resolved.tradingsymbol);
}

/** Broker-aware order status. */
export async function getOrderStatusSmart(
  userId: string,
  orderId: string,
  dhanFetch: () => Promise<any>,
): Promise<any> {
  const broker = await getActiveBroker(userId);
  if (broker !== "zerodha") return await dhanFetch();
  const svc = await getKiteService(userId);
  if (!svc) return null;
  try {
    const st = await svc.getOrderStatus(orderId);
    return {
      orderId: String(st?.order_id || orderId),
      orderStatus: String(st?.status || "").toUpperCase(),
      tradedQuantity: Number(st?.filled_quantity || 0),
      averageTradedPrice: Number(st?.average_price || 0),
      broker: "zerodha",
      raw: st,
    };
  } catch (e) {
    console.error("[KITE] order status failed:", (e as any)?.message || e);
    return null;
  }
}

/** Broker-aware cancel. */
export async function cancelOrderSmart(
  userId: string,
  orderId: string,
  dhanCancel: () => Promise<boolean>,
): Promise<boolean> {
  const broker = await getActiveBroker(userId);
  if (broker !== "zerodha") return await dhanCancel();
  const svc = await getKiteService(userId);
  if (!svc) return false;
  return await svc.cancelOrder(orderId);
}
