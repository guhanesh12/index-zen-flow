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
import {
  UpstoxService,
  upstoxProductFromDhan,
} from "./upstox_service.tsx";
import { ensureUpstoxInstruments } from "./upstox_instruments.tsx";
import {
  FyersService,
  fyersProductFromDhan,
} from "./fyers_service.tsx";
import { ensureFyersInstruments } from "./fyers_instruments.tsx";
import {
  AngelOneService,
  ANGELONE_API,
  angeloneExchangeFromSegment,
  angeloneProductFromDhan,
  angeloneLogin,
} from "./angelone_service.tsx";
import { ensureAngelOneInstruments } from "./angelone_instruments.tsx";


const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
);

export type BrokerId = "dhan" | "zerodha" | "groww" | "upstox" | "fyers" | "angelone";
const KNOWN_BROKERS: BrokerId[] = ["dhan", "zerodha", "groww", "upstox", "fyers", "angelone"];


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

/** Flip the profile's broker_connected flag (drives dashboard connection badge). */
export async function setBrokerConnected(userId: string, connected: boolean): Promise<void> {
  try {
    await supabaseAdmin
      .from("profiles")
      .update({ broker_connected: connected })
      .eq("user_id", userId);
  } catch (e) {
    console.error("[BROKER] broker_connected update failed:", (e as any)?.message || e);
  }
}

/** Wipe one broker's stored session (KV secret + non-secret mirror row). */
async function clearBrokerSession(userId: string, broker: BrokerId) {
  if (broker === "dhan") await kv.del(`api_credentials:${userId}`);
  if (broker === "zerodha") await clearKiteCredentials(userId);
  if (broker === "groww") await clearGrowwCredentials(userId);
  if (broker === "upstox") await clearUpstoxCredentials(userId);
  if (broker === "fyers") await clearFyersCredentials(userId);
  if (broker === "angelone") await clearAngelOneCredentials(userId);
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

  // Instrument masters are large shared downloads. Never block broker selection
  // or login on them; the broker endpoints schedule/track synchronization.
}

// ───────────────────────── angelone credentials ─────────────────────────

export interface AngelOneStoredCreds {
  apiKey: string;              // SmartAPI trading API key
  clientCode: string;          // Angel One client code (e.g. "A123456")
  password?: string;           // MPIN / login password (needed for daily re-login)
  totpSecret?: string;         // base32 secret from SmartAPI → TOTP
  jwtToken?: string;           // daily session token
  refreshToken?: string;
  feedToken?: string;
  angeloneUserName?: string;
  tokenExpiry?: string;
  lastStatus?: string;
  lastError?: string | null;
}

export async function getAngelOneCredentials(userId: string): Promise<AngelOneStoredCreds | null> {
  const creds = (await kv.get(`angelone_credentials:${userId}`)) as AngelOneStoredCreds | null;
  if (!creds?.apiKey && !creds?.jwtToken) return null;
  return creds;
}

export async function saveAngelOneCredentials(userId: string, patch: Partial<AngelOneStoredCreds>) {
  const existing = (await getAngelOneCredentials(userId)) || ({} as AngelOneStoredCreds);
  const merged = { ...existing, ...patch };
  await kv.set(`angelone_credentials:${userId}`, merged);
  return merged;
}

export async function clearAngelOneCredentials(userId: string) {
  await kv.del(`angelone_credentials:${userId}`);
}

/**
 * Angel One sessions expire every morning. Because the user's API key, client code,
 * MPIN and TOTP secret are stored once, we can silently mint a fresh JWT instead of
 * asking them to type credentials again. Returns the usable credentials or null.
 */
export async function ensureAngelOneSession(
  userId: string,
  opts: { force?: boolean } = {},
): Promise<AngelOneStoredCreds | null> {
  const creds = await getAngelOneCredentials(userId);
  if (!creds?.apiKey) return null;

  const expired = creds.tokenExpiry ? Date.parse(creds.tokenExpiry) <= Date.now() + 60_000 : false;
  if (creds.jwtToken && !expired && !opts.force) return creds;

  // Need password + TOTP secret to re-login without user input.
  if (!creds.clientCode || !creds.password || !creds.totpSecret) return creds.jwtToken ? creds : null;

  try {
    const session = await angeloneLogin({
      apiKey: creds.apiKey,
      clientCode: creds.clientCode,
      password: creds.password,
      totpSecret: creds.totpSecret,
    });
    return await saveAngelOneCredentials(userId, {
      jwtToken: session.jwtToken,
      refreshToken: session.refreshToken,
      feedToken: session.feedToken,
      tokenExpiry: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString(),
      lastStatus: "connected",
      lastError: null,
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error("[ANGELONE] auto re-login failed:", msg);
    await saveAngelOneCredentials(userId, { lastStatus: "login_failed", lastError: msg });
    return creds.jwtToken ? creds : null;
  }
}

export async function getAngelOneService(userId: string): Promise<AngelOneService | null> {
  const creds = await ensureAngelOneSession(userId);
  if (!creds?.jwtToken || !creds?.apiKey) return null;
  const proxy = await makeBrokerProxy(userId, "angelone", ANGELONE_API);
  return new AngelOneService({ apiKey: creds.apiKey, jwtToken: creds.jwtToken, proxy });
}

/** Non-secret mirror so the Broker screen can show Angel One status. */
export async function mirrorAngelOneStatus(userId: string, patch: Record<string, any>) {
  try {
    const { data: existing } = await supabaseAdmin
      .from("broker_credentials")
      .select("id")
      .eq("user_id", userId)
      .eq("broker", "angelone")
      .maybeSingle();
    const payload = { user_id: userId, broker: "angelone", auth_method: "totp", ...patch };
    if (existing?.id) {
      await supabaseAdmin.from("broker_credentials").update(payload).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("broker_credentials").insert(payload);
    }
  } catch (e) {
    console.error("[ANGELONE] status mirror failed:", (e as any)?.message || e);
  }
}

/** Resolve a Dhan-style order into an Angel One trading symbol + symbol token. */
export async function resolveAngelOneSymbol(order: any): Promise<{
  tradingSymbol: string;
  symbolToken: string;
  exchange: "NFO" | "BFO";
  lotSize: number;
} | null> {
  const securityId = String(order?.securityId || "");
  const symbolText = String(order?.symbol || order?.tradingSymbol || "").trim();
  const COLS =
    "lot_size, exchange_segment, angelone_tradingsymbol, angelone_symbol_token, angelone_exchange";

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
        .or(`symbol.eq.${symbolText},angelone_tradingsymbol.eq.${symbolText.toUpperCase()}`)
        .maybeSingle();
      inst = data;
    }
    return inst;
  };

  let inst = await lookup();
  if (!inst?.angelone_symbol_token) {
    await ensureAngelOneInstruments(!!inst);
    const retry = await lookup();
    if (retry?.angelone_symbol_token) inst = retry;
  }

  if (!inst?.angelone_symbol_token) {
    // Position exits carry the Angel One token/symbol straight from Angel One positions.
    const token = String(order?.angeloneSymbolToken || "").trim();
    if (token && symbolText) {
      return {
        tradingSymbol: symbolText.toUpperCase(),
        symbolToken: token,
        exchange: angeloneExchangeFromSegment(order?.exchangeSegment),
        lotSize: Number(order?.lotSize || 0),
      };
    }
    return null;
  }

  return {
    tradingSymbol: String(inst.angelone_tradingsymbol || symbolText).toUpperCase(),
    symbolToken: String(inst.angelone_symbol_token),
    exchange: (String(inst.angelone_exchange || "").toUpperCase() === "BFO"
      ? "BFO"
      : angeloneExchangeFromSegment(inst.exchange_segment)) as "NFO" | "BFO",
    lotSize: Number(inst.lot_size || 0),
  };
}

// ───────────────────────── fyers credentials ─────────────────────────

export interface FyersStoredCreds {
  appId: string;              // e.g. "XXXXXXXX-100"
  appSecret: string;
  redirectUri?: string;
  accessToken?: string;
  refreshToken?: string;
  fyersUserId?: string;
  tokenExpiry?: string;
  lastStatus?: string;
  lastError?: string | null;
}

export async function getFyersCredentials(userId: string): Promise<FyersStoredCreds | null> {
  const creds = (await kv.get(`fyers_credentials:${userId}`)) as FyersStoredCreds | null;
  if (!creds?.appId && !creds?.accessToken) return null;
  return creds;
}

export async function saveFyersCredentials(userId: string, patch: Partial<FyersStoredCreds>) {
  const existing = (await getFyersCredentials(userId)) || ({} as FyersStoredCreds);
  const merged = { ...existing, ...patch };
  await kv.set(`fyers_credentials:${userId}`, merged);
  return merged;
}

export async function clearFyersCredentials(userId: string) {
  await kv.del(`fyers_credentials:${userId}`);
}

export async function getFyersService(userId: string): Promise<FyersService | null> {
  const creds = await getFyersCredentials(userId);
  if (!creds?.accessToken || !creds?.appId) return null;
  const proxy = await makeBrokerProxy(userId, "fyers");
  return new FyersService({ appId: creds.appId, accessToken: creds.accessToken, proxy });
}

/** Non-secret mirror so the Broker screen can show Fyers status. */
export async function mirrorFyersStatus(userId: string, patch: Record<string, any>) {
  try {
    const { data: existing } = await supabaseAdmin
      .from("broker_credentials")
      .select("id")
      .eq("user_id", userId)
      .eq("broker", "fyers")
      .maybeSingle();
    const payload = { user_id: userId, broker: "fyers", auth_method: "oauth", ...patch };
    if (existing?.id) {
      await supabaseAdmin.from("broker_credentials").update(payload).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("broker_credentials").insert(payload);
    }
  } catch (e) {
    console.error("[FYERS] status mirror failed:", (e as any)?.message || e);
  }
}

/** Resolve a Dhan-style order into a Fyers symbol (e.g. "NSE:NIFTY25AUG24200CE"). */
export async function resolveFyersSymbol(order: any): Promise<{
  fyersSymbol: string;
  tradingSymbol: string;
  lotSize: number;
} | null> {
  const securityId = String(order?.securityId || "");
  const symbolText = String(order?.symbol || order?.tradingSymbol || "").trim();
  const COLS = "lot_size, exchange_segment, fyers_symbol, fyers_tradingsymbol";

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
        .or(`symbol.eq.${symbolText},fyers_tradingsymbol.eq.${symbolText.toUpperCase()}`)
        .maybeSingle();
      inst = data;
    }
    return inst;
  };

  let inst = await lookup();
  if (!inst?.fyers_symbol) {
    await ensureFyersInstruments(!!inst);
    const retry = await lookup();
    if (retry?.fyers_symbol) inst = retry;
  }

  if (!inst?.fyers_symbol) {
    // Position exits carry the Fyers symbol directly from Fyers positions.
    const candidate = /^(NSE|BSE):/i.test(securityId)
      ? securityId
      : /^(NSE|BSE):/i.test(symbolText) ? symbolText : "";
    if (candidate) {
      return {
        fyersSymbol: candidate.toUpperCase(),
        tradingSymbol: candidate.split(":").pop() || candidate,
        lotSize: Number(order?.lotSize || 0),
      };
    }
    return null;
  }

  return {
    fyersSymbol: String(inst.fyers_symbol),
    tradingSymbol: String(inst.fyers_tradingsymbol || symbolText),
    lotSize: Number(inst.lot_size || 0),
  };
}

// ───────────────────────── upstox credentials ─────────────────────────

export interface UpstoxStoredCreds {
  apiKey: string;
  apiSecret: string;
  redirectUri?: string;
  accessToken?: string;
  upstoxUserId?: string;
  upstoxUserName?: string;
  tokenExpiry?: string;
  lastStatus?: string;
  lastError?: string | null;
}

export async function getUpstoxCredentials(userId: string): Promise<UpstoxStoredCreds | null> {
  const creds = (await kv.get(`upstox_credentials:${userId}`)) as UpstoxStoredCreds | null;
  if (!creds?.apiKey && !creds?.accessToken) return null;
  return creds;
}

export async function saveUpstoxCredentials(userId: string, patch: Partial<UpstoxStoredCreds>) {
  const existing = (await getUpstoxCredentials(userId)) || ({} as UpstoxStoredCreds);
  const merged = { ...existing, ...patch };
  await kv.set(`upstox_credentials:${userId}`, merged);
  return merged;
}

export async function clearUpstoxCredentials(userId: string) {
  await kv.del(`upstox_credentials:${userId}`);
}

export async function getUpstoxService(userId: string): Promise<UpstoxService | null> {
  const creds = await getUpstoxCredentials(userId);
  if (!creds?.accessToken) return null;
  const proxy = await makeBrokerProxy(userId, "upstox");
  return new UpstoxService({ accessToken: creds.accessToken, proxy });
}

/** Non-secret mirror so the Broker screen can show Upstox status. */
export async function mirrorUpstoxStatus(userId: string, patch: Record<string, any>) {
  try {
    const { data: existing } = await supabaseAdmin
      .from("broker_credentials")
      .select("id")
      .eq("user_id", userId)
      .eq("broker", "upstox")
      .maybeSingle();
    const payload = { user_id: userId, broker: "upstox", auth_method: "oauth", ...patch };
    if (existing?.id) {
      await supabaseAdmin.from("broker_credentials").update(payload).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("broker_credentials").insert(payload);
    }
  } catch (e) {
    console.error("[UPSTOX] status mirror failed:", (e as any)?.message || e);
  }
}

/** Resolve a Dhan-style order into an Upstox instrument key. */
export async function resolveUpstoxSymbol(order: any): Promise<{
  instrumentKey: string;
  tradingSymbol: string;
  lotSize: number;
} | null> {
  const securityId = String(order?.securityId || "");
  const symbolText = String(order?.symbol || order?.tradingSymbol || "").trim();
  const COLS = "lot_size, exchange_segment, upstox_instrument_key, upstox_tradingsymbol";

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
        .or(`symbol.eq.${symbolText},upstox_tradingsymbol.eq.${symbolText.toUpperCase()}`)
        .maybeSingle();
      inst = data;
    }
    return inst;
  };

  let inst = await lookup();
  if (!inst?.upstox_instrument_key) {
    await ensureUpstoxInstruments(!!inst);
    const retry = await lookup();
    if (retry?.upstox_instrument_key) inst = retry;
  }

  if (!inst?.upstox_instrument_key) {
    // Position exits carry the instrument key directly from Upstox positions.
    if (/^[A-Z]+_[A-Z]+\|/.test(symbolText.toUpperCase()) || /^[A-Z]+_[A-Z]+\|/.test(securityId)) {
      const key = /\|/.test(securityId) ? securityId : symbolText.toUpperCase();
      return { instrumentKey: key, tradingSymbol: symbolText, lotSize: Number(order?.lotSize || 0) };
    }
    return null;
  }

  return {
    instrumentKey: String(inst.upstox_instrument_key),
    tradingSymbol: String(inst.upstox_tradingsymbol || symbolText),
    lotSize: Number(inst.lot_size || 0),
  };
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

/**
 * 🔀 Route ANY broker HTTP call through the user's dedicated static-IP VPS.
 * Returns `undefined` when no IP / key / new-enough VPS image is available, in
 * which case the caller transparently falls back to a direct API call.
 * Works for every broker (present and future) via the VPS `/broker-request`
 * proxy — no VPS redeploy needed when a new broker is added.
 */
export async function makeBrokerProxy(userId: string, broker: string, baseUrl?: string) {
  const ORDER_SERVER_API_KEY = Deno.env.get("ORDER_SERVER_API_KEY");
  if (!ORDER_SERVER_API_KEY) return undefined;

  let ip: string;
  try {
    ip = (await getUserOrderPlacementIP(userId)).ipAddress;
  } catch {
    return undefined;
  }

  return async (r: { method: string; path: string; headers: Record<string, string>; body?: string }) => {
    try {
      const resp = await fetch(`http://${ip}:3000/broker-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ORDER_SERVER_API_KEY}` },
        body: JSON.stringify({
          broker,
          baseUrl,
          method: r.method,
          path: r.path,
          headers: r.headers,
          body: r.body,
        }),
        signal: AbortSignal.timeout(9000),
      });
      if (resp.status === 404 || resp.status === 400) return null; // old image / unknown broker → direct
      const text = await resp.text();
      let json: any = {};
      try { json = JSON.parse(text); } catch { json = { raw: text }; }
      return { status: resp.status, json, text };
    } catch (e: any) {
      console.warn(`[${broker.toUpperCase()}] VPS proxy unreachable → direct API:`, e?.message || e);
      return null;
    }
  };
}

export async function getGrowwService(userId: string): Promise<GrowwService | null> {
  const creds = await getGrowwCredentials(userId);
  if (!creds?.accessToken) return null;
  const proxy = await makeBrokerProxy(userId, "groww");
  return new GrowwService({ accessToken: creds.accessToken, proxy });
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

  // 🔴 ANGEL ONE
  if (broker === "angelone") {
    const aCreds = await getAngelOneCredentials(userId);
    if (!aCreds?.jwtToken || !aCreds?.apiKey) {
      const err: any = new Error(
        "TOKEN_EXPIRED:Angel One is your active broker but no valid Angel One session was found. Open Broker Setup → Angel One and login again.",
      );
      err.code = "TOKEN_EXPIRED";
      throw err;
    }
    const a = await resolveAngelOneSymbol(orderDetails);
    if (!a?.symbolToken) {
      throw new Error("Could not map this contract to an Angel One symbol. Refresh the instrument master and retry.");
    }
    const aProxy = await makeBrokerProxy(userId, "angelone", ANGELONE_API);
    const svcA = new AngelOneService({ apiKey: aCreds.apiKey, jwtToken: aCreds.jwtToken, proxy: aProxy });
    try {
      const res = await svcA.placeOrder({
        tradingSymbol: a.tradingSymbol,
        symbolToken: a.symbolToken,
        exchange: a.exchange,
        transactionType: String(orderDetails.transactionType || "BUY").toUpperCase() as "BUY" | "SELL",
        quantity: Math.max(1, Number(orderDetails.quantity) || 0),
        product: angeloneProductFromDhan(orderDetails.productType),
        orderType: "MARKET",
        duration: "DAY",
      });
      return {
        success: !!res.orderId,
        orderId: res.orderId,
        orderStatus: res.orderId ? "PLACED" : "REJECTED",
        broker: "angelone",
        routedVia: aProxy ? "static-ip" : "edge",
        message: res.orderId ? "Order placed via Angel One" : "Angel One order rejected",
        raw: res.raw,
      };
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (/token|session|unauthor|expired|invalid/i.test(msg)) {
        const err: any = new Error(
          "TOKEN_EXPIRED:Your Angel One session has expired (SmartAPI tokens reset daily). Login again from Broker Setup → Angel One.",
        );
        err.code = "TOKEN_EXPIRED";
        throw err;
      }
      throw new Error(msg);
    }
  }

  // 🔵 FYERS
  if (broker === "fyers") {
    const fCreds = await getFyersCredentials(userId);
    if (!fCreds?.accessToken || !fCreds?.appId) {
      const err: any = new Error(
        "TOKEN_EXPIRED:Fyers is your active broker but no valid Fyers session was found. Open Broker Setup → Fyers and login again.",
      );
      err.code = "TOKEN_EXPIRED";
      throw err;
    }
    const f = await resolveFyersSymbol(orderDetails);
    if (!f?.fyersSymbol) {
      throw new Error("Could not map this contract to a Fyers symbol. Refresh the instrument master and retry.");
    }
    const fProxy = await makeBrokerProxy(userId, "fyers");
    const svcF = new FyersService({ appId: fCreds.appId, accessToken: fCreds.accessToken, proxy: fProxy });
    try {
      const res = await svcF.placeOrder({
        symbol: f.fyersSymbol,
        transactionType: String(orderDetails.transactionType || "BUY").toUpperCase() as "BUY" | "SELL",
        quantity: Math.max(1, Number(orderDetails.quantity) || 0),
        product: fyersProductFromDhan(orderDetails.productType),
        orderType: "MARKET",
        validity: "DAY",
      });
      return {
        success: !!res.orderId,
        orderId: res.orderId,
        orderStatus: res.orderId ? "PLACED" : "REJECTED",
        broker: "fyers",
        routedVia: fProxy ? "static-ip" : "edge",
        message: res.orderId ? "Order placed via Fyers" : "Fyers order rejected",
        raw: res.raw,
      };
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (/token|session|unauthor|expired|invalid app/i.test(msg)) {
        const err: any = new Error(
          "TOKEN_EXPIRED:Your Fyers session has expired (Fyers tokens reset daily). Login again from Broker Setup → Fyers.",
        );
        err.code = "TOKEN_EXPIRED";
        throw err;
      }
      throw new Error(msg);
    }
  }

  // 🟣 UPSTOX
  if (broker === "upstox") {
    const uCreds = await getUpstoxCredentials(userId);
    if (!uCreds?.accessToken) {
      const err: any = new Error(
        "TOKEN_EXPIRED:Upstox is your active broker but no valid Upstox session was found. Open Broker Setup → Upstox and login again.",
      );
      err.code = "TOKEN_EXPIRED";
      throw err;
    }
    const u = await resolveUpstoxSymbol(orderDetails);
    if (!u?.instrumentKey) {
      throw new Error("Could not map this contract to an Upstox instrument key. Refresh the instrument master and retry.");
    }
    const uProxy = await makeBrokerProxy(userId, "upstox");
    const svcU = new UpstoxService({ accessToken: uCreds.accessToken, proxy: uProxy });
    try {
      const res = await svcU.placeOrder({
        instrumentToken: u.instrumentKey,
        transactionType: String(orderDetails.transactionType || "BUY").toUpperCase() as "BUY" | "SELL",
        quantity: Math.max(1, Number(orderDetails.quantity) || 0),
        product: upstoxProductFromDhan(orderDetails.productType),
        orderType: "MARKET",
        validity: "DAY",
        tag: "indexpilot",
      });
      return {
        success: !!res.orderId,
        orderId: res.orderId,
        orderStatus: res.orderId ? "PLACED" : "REJECTED",
        broker: "upstox",
        routedVia: uProxy ? "static-ip" : "edge",
        message: res.orderId ? "Order placed via Upstox" : "Upstox order rejected",
        raw: res.raw,
      };
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (/token|session|unauthor|expired|UDAPI100050/i.test(msg)) {
        const err: any = new Error(
          "TOKEN_EXPIRED:Your Upstox session has expired (Upstox tokens reset daily at 3:30 AM). Login again from Broker Setup → Upstox.",
        );
        err.code = "TOKEN_EXPIRED";
        throw err;
      }
      throw new Error(msg);
    }
  }

  // 🟢 GROWW
  if (broker === "groww") {
    const gCreds = await getGrowwCredentials(userId);
    if (!gCreds?.accessToken) {
      const err: any = new Error(
        "TOKEN_EXPIRED:Groww is your active broker but no valid Groww session was found. Open Broker Setup → Groww and save your access token again.",
      );
      err.code = "TOKEN_EXPIRED";
      throw err;
    }
    const g = await resolveGrowwSymbol(orderDetails);
    if (!g?.tradingSymbol) {
      throw new Error("Could not map this contract to a Groww trading symbol. Refresh the instrument master and retry.");
    }
    // Orders go out through the user's dedicated static IP (same VPS as Dhan).
    const gProxy = await makeBrokerProxy(userId, "groww");
    const svcG = new GrowwService({ accessToken: gCreds.accessToken, proxy: gProxy });
    try {
      const res = await svcG.placeOrder({
        tradingSymbol: g.tradingSymbol,
        exchange: g.exchange,
        segment: g.segment,
        transactionType: String(orderDetails.transactionType || "BUY").toUpperCase() as "BUY" | "SELL",
        quantity: Math.max(1, Number(orderDetails.quantity) || 0),
        product: growwProductFromDhan(orderDetails.productType),
        orderType: "MARKET",
        validity: "DAY",
      });
      return {
        success: !!res.orderId,
        orderId: res.orderId,
        orderStatus: res.orderId ? "PLACED" : "REJECTED",
        broker: "groww",
        routedVia: gProxy ? "static-ip" : "edge",
        message: res.orderId ? "Order placed via Groww" : "Groww order rejected",
        raw: res.raw,
      };
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (/token|session|unauthor|expired/i.test(msg)) {
        const err: any = new Error(
          "TOKEN_EXPIRED:Your Groww session has expired. Create a new Trade API access token and save it in Broker Setup → Groww.",
        );
        err.code = "TOKEN_EXPIRED";
        throw err;
      }
      throw new Error(msg);
    }
  }

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
  if (broker === "angelone") {
    const a = await getAngelOneService(userId);
    if (!a) return [];
    try {
      return await a.getPositions();
    } catch (e) {
      console.error("[ANGELONE] positions failed:", (e as any)?.message || e);
      return [];
    }
  }
  if (broker === "fyers") {
    const f = await getFyersService(userId);
    if (!f) return [];
    try {
      return await f.getPositions();
    } catch (e) {
      console.error("[FYERS] positions failed:", (e as any)?.message || e);
      return [];
    }
  }
  if (broker === "upstox") {
    const u = await getUpstoxService(userId);
    if (!u) return [];
    try {
      return await u.getPositions();
    } catch (e) {
      console.error("[UPSTOX] positions failed:", (e as any)?.message || e);
      return [];
    }
  }
  if (broker === "groww") {
    const g = await getGrowwService(userId);
    if (!g) return [];
    try {
      return await g.getPositions();
    } catch (e) {
      console.error("[GROWW] positions failed:", (e as any)?.message || e);
      return [];
    }
  }
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
  if (broker === "angelone") {
    const a = await getAngelOneService(userId);
    if (!a) return null;
    try {
      return await a.getFundLimits();
    } catch (e) {
      console.error("[ANGELONE] funds failed:", (e as any)?.message || e);
      return null;
    }
  }
  if (broker === "fyers") {
    const f = await getFyersService(userId);
    if (!f) return null;
    try {
      return await f.getFundLimits();
    } catch (e) {
      console.error("[FYERS] funds failed:", (e as any)?.message || e);
      return null;
    }
  }
  if (broker === "upstox") {
    const u = await getUpstoxService(userId);
    if (!u) return null;
    try {
      return await u.getFundLimits();
    } catch (e) {
      console.error("[UPSTOX] funds failed:", (e as any)?.message || e);
      return null;
    }
  }
  if (broker === "groww") {
    const g = await getGrowwService(userId);
    if (!g) return null;
    try {
      return await g.getFundLimits();
    } catch (e) {
      console.error("[GROWW] funds failed:", (e as any)?.message || e);
      return null;
    }
  }
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

/** Broker-aware last traded price for a contract (Dhan securityId or broker symbol). */
export async function getLtpSmart(
  userId: string,
  order: any,
  dhanFetch: () => Promise<number | null>,
): Promise<number | null> {
  const broker = await getActiveBroker(userId);
  if (broker === "angelone") {
    const a = await getAngelOneService(userId);
    if (!a) return null;
    const ra = await resolveAngelOneSymbol(order);
    if (!ra) return null;
    return await a.getLastPrice(ra.exchange, ra.tradingSymbol, ra.symbolToken);
  }
  if (broker === "fyers") {
    const f = await getFyersService(userId);
    if (!f) return null;
    const rf = await resolveFyersSymbol(order);
    if (!rf) return null;
    return await f.getLastPrice(rf.fyersSymbol);
  }
  if (broker === "upstox") {
    const u = await getUpstoxService(userId);
    if (!u) return null;
    const ru = await resolveUpstoxSymbol(order);
    if (!ru) return null;
    return await u.getLastPrice(ru.instrumentKey);
  }
  if (broker === "groww") {
    const g = await getGrowwService(userId);
    if (!g) return null;
    const resolved = await resolveGrowwSymbol(order);
    if (!resolved) return null;
    return await g.getLastPrice(resolved.exchange, resolved.segment, resolved.tradingSymbol);
  }
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
  if (broker === "angelone") {
    const a = await getAngelOneService(userId);
    if (!a) return null;
    try {
      const st = await a.getOrderStatus(orderId);
      return {
        orderId: String(st?.orderid || orderId),
        orderStatus: String(st?.orderstatus || st?.status || "").toUpperCase(),
        tradedQuantity: Number(st?.filledshares ?? 0),
        averageTradedPrice: Number(st?.averageprice ?? 0),
        broker: "angelone",
        raw: st,
      };
    } catch (e) {
      console.error("[ANGELONE] order status failed:", (e as any)?.message || e);
      return null;
    }
  }
  if (broker === "fyers") {
    const f = await getFyersService(userId);
    if (!f) return null;
    try {
      const st = await f.getOrderStatus(orderId);
      return {
        orderId: String(st?.id || orderId),
        orderStatus: String(st?.status === 2 ? "COMPLETE" : st?.status === 5 ? "REJECTED" : st?.status === 6 ? "PENDING" : st?.status === 1 ? "CANCELLED" : st?.status ?? "").toUpperCase(),
        tradedQuantity: Number(st?.filledQty ?? 0),
        averageTradedPrice: Number(st?.tradedPrice ?? 0),
        broker: "fyers",
        raw: st,
      };
    } catch (e) {
      console.error("[FYERS] order status failed:", (e as any)?.message || e);
      return null;
    }
  }
  if (broker === "upstox") {
    const u = await getUpstoxService(userId);
    if (!u) return null;
    try {
      const st = await u.getOrderStatus(orderId);
      return {
        orderId: String(st?.order_id || orderId),
        orderStatus: String(st?.status || "").toUpperCase(),
        tradedQuantity: Number(st?.filled_quantity ?? 0),
        averageTradedPrice: Number(st?.average_price ?? 0),
        broker: "upstox",
        raw: st,
      };
    } catch (e) {
      console.error("[UPSTOX] order status failed:", (e as any)?.message || e);
      return null;
    }
  }
  if (broker === "groww") {
    const g = await getGrowwService(userId);
    if (!g) return null;
    try {
      const st = await g.getOrderStatus(orderId);
      return {
        orderId: String(st?.groww_order_id || st?.order_id || orderId),
        orderStatus: String(st?.order_status || st?.status || "").toUpperCase(),
        tradedQuantity: Number(st?.filled_quantity ?? 0),
        averageTradedPrice: Number(st?.average_fill_price ?? st?.average_price ?? 0),
        broker: "groww",
        raw: st,
      };
    } catch (e) {
      console.error("[GROWW] order status failed:", (e as any)?.message || e);
      return null;
    }
  }
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
  if (broker === "angelone") {
    const a = await getAngelOneService(userId);
    if (!a) return false;
    return await a.cancelOrder(orderId);
  }
  if (broker === "fyers") {
    const f = await getFyersService(userId);
    if (!f) return false;
    return await f.cancelOrder(orderId);
  }
  if (broker === "upstox") {
    const u = await getUpstoxService(userId);
    if (!u) return false;
    return await u.cancelOrder(orderId);
  }
  if (broker === "groww") {
    const g = await getGrowwService(userId);
    if (!g) return false;
    return await g.cancelOrder(orderId);
  }
  if (broker !== "zerodha") return await dhanCancel();
  const svc = await getKiteService(userId);
  if (!svc) return false;
  return await svc.cancelOrder(orderId);
}

