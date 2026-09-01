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
  GROWW_API,
  growwExchangeFromSegment,
  growwProductFromDhan,
} from "./groww_service.tsx";
import { ensureGrowwInstruments } from "./groww_instruments.tsx";
import {
  UpstoxService,
  UPSTOX_API,
  upstoxProductFromDhan,
} from "./upstox_service.tsx";
import { ensureUpstoxInstruments } from "./upstox_instruments.tsx";
import {
  FyersService,
  FYERS_API,
  fyersProductFromDhan,
} from "./fyers_service.tsx";
import { ensureFyersInstruments } from "./fyers_instruments.tsx";
import {
  AngelOneService,
  ANGELONE_API,
  angeloneExchangeFromSegment,
  angeloneProductFromDhan,
  angeloneLogin,
  angeloneTokenExpiry,
} from "./angelone_service.tsx";
import { ensureAngelOneInstruments } from "./angelone_instruments.tsx";
import {
  AliceblueService,
  ALICEBLUE_API,
  aliceblueExchangeFromSegment,
  aliceblueProductFromDhan,
  aliceblueVendorSession,
  aliceblueTokenExpiry,
} from "./aliceblue_service.tsx";
import { ensureAliceblueInstruments } from "./aliceblue_instruments.tsx";
import {
  FivepaisaService,
  FIVEPAISA_API,
  fivepaisaExchangeFromSegment,
  fivepaisaExchangeTypeFromSegment,
  fivepaisaIntradayFromDhan,
} from "./fivepaisa_service.tsx";
import { ensureFivepaisaInstruments } from "./fivepaisa_instruments.tsx";


const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
);

export type BrokerId = "dhan" | "zerodha" | "groww" | "upstox" | "fyers" | "angelone" | "aliceblue" | "5paisa";
const KNOWN_BROKERS: BrokerId[] = ["dhan", "zerodha", "groww", "upstox", "fyers", "angelone", "aliceblue", "5paisa"];

// ─────────────── universal instrument resolution (all brokers) ───────────────

const KNOWN_INDICES = ["MIDCPNIFTY", "FINNIFTY", "BANKNIFTY", "BANKEX", "SENSEX", "NIFTY"];

/**
 * Parse any contract label we may receive ("NIFTY-Feb2026-25400-CE",
 * "NIFTY-SEP2026-25400-CE", "BANKNIFTY 54000 PE", …) into its parts so a stale
 * or broker-specific label can still be matched against the live master.
 */
export function parseContractLabel(text: string): { index: string; strike: number; optionType: "CE" | "PE" } | null {
  const t = String(text || "").toUpperCase().replace(/\s+/g, "");
  if (!t) return null;
  const index = KNOWN_INDICES.find((i) => t.includes(i));
  if (!index) return null;
  const optionType = /(^|[^A-Z])(PE|PUT)([^A-Z]|$)/.test(t) || /PE$/.test(t)
    ? "PE"
    : (/(^|[^A-Z])(CE|CALL)([^A-Z]|$)/.test(t) || /CE$/.test(t) ? "CE" : null);
  if (!optionType) return null;
  // strike = the largest standalone 3-6 digit group that is not a year
  const groups = (t.match(/\d{3,6}/g) || [])
    .map((n) => Number(n))
    .filter((n) => n >= 100 && !(n >= 2000 && n <= 2100));
  if (!groups.length) return null;
  const strike = groups.sort((a, b) => b - a)[0];
  return { index, strike, optionType };
}

/**
 * Find the instrument_master row for an order, whatever the caller supplied.
 *   1. exact security_id (Dhan id used by the engine)
 *   2. exact symbol / broker-native trading symbol
 *   3. re-map: same index + strike + option type on the nearest LIVE expiry
 *      (this rescues stale saved slots such as an expired Feb contract)
 * Always returns the full row so callers can also pick up the fresh security_id.
 */
export async function findInstrumentRow(order: any, extraCols = ""): Promise<any | null> {
  const base =
    "security_id, symbol, index_name, strike_price, option_type, expiry_date, lot_size, exchange_segment";
  const COLS = Array.from(
    new Set(`${base}${extraCols ? "," + extraCols : ""}`.split(",").map((c) => c.trim()).filter(Boolean)),
  ).join(", ");
  const securityId = String(order?.securityId || "").trim();
  const symbolText = String(order?.symbol || order?.symbolName || order?.tradingSymbol || "").trim();

  if (securityId && /^\d+$/.test(securityId)) {
    const { data } = await supabaseAdmin
      .from("instrument_master").select(COLS).eq("security_id", securityId).maybeSingle();
    if (data) return data;
  }

  if (symbolText) {
    const { data } = await supabaseAdmin
      .from("instrument_master").select(COLS).eq("symbol", symbolText).maybeSingle();
    if (data) return data;
    const { data: up } = await supabaseAdmin
      .from("instrument_master").select(COLS).eq("symbol", symbolText.toUpperCase()).maybeSingle();
    if (up) return up;
  }

  // 3) contract re-map onto the nearest live expiry
  const parsed = parseContractLabel(symbolText) || parseContractLabel(String(order?.index || ""));
  if (!parsed) return null;
  const today = new Date().toISOString().slice(0, 10);
  const { data: remap } = await supabaseAdmin
    .from("instrument_master")
    .select(COLS)
    .eq("index_name", parsed.index)
    .eq("option_type", parsed.optionType)
    .eq("strike_price", parsed.strike)
    .gte("expiry_date", today)
    .order("expiry_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (remap) {
    console.log(
      `[INSTRUMENT] re-mapped "${symbolText || securityId}" → ${(remap as any).symbol} (${(remap as any).security_id})`,
    );
    return remap;
  }
  return null;
}



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

function hasUsableToken(token: unknown, expiry?: unknown): boolean {
  if (!String(token || "").trim()) return false;
  if (!expiry) return true;
  const expiresAt = Date.parse(String(expiry));
  return !Number.isFinite(expiresAt) || expiresAt > Date.now() + 60_000;
}

/**
 * True when the broker's real KV session is usable.
 * `broker_credentials` is only a non-secret UI/status mirror, so it must never
 * be used as the source of truth for engine authentication.
 */
export async function isBrokerConnected(userId: string, broker: BrokerId): Promise<boolean> {
  try {
    if (broker === "dhan") {
      const creds = (await kv.get(`api_credentials:${userId}`)) as any;
      return Boolean(creds?.dhanClientId && creds?.dhanAccessToken);
    }
    if (broker === "zerodha") {
      const creds = await getKiteCredentials(userId);
      return Boolean(creds?.apiKey && hasUsableToken(creds?.accessToken, creds?.tokenExpiry));
    }
    if (broker === "groww") {
      const creds = await getGrowwCredentials(userId);
      return hasUsableToken(creds?.accessToken, creds?.tokenExpiry);
    }
    if (broker === "upstox") {
      const creds = await getUpstoxCredentials(userId);
      return hasUsableToken(creds?.accessToken, creds?.tokenExpiry);
    }
    if (broker === "fyers") {
      const creds = await getFyersCredentials(userId);
      return Boolean(creds?.appId && hasUsableToken(creds?.accessToken, creds?.tokenExpiry));
    }
    if (broker === "angelone") {
      const creds = await ensureAngelOneSession(userId);
      return Boolean(creds?.apiKey && hasUsableToken(creds?.jwtToken, creds?.tokenExpiry));
    }
    if (broker === "aliceblue") {
      const creds = await ensureAliceblueSession(userId);
      return Boolean(creds?.userId && hasUsableToken(creds?.sessionId, creds?.tokenExpiry));
    }
    if (broker === "5paisa") {
      const creds = await ensureFivepaisaSession(userId);
      return Boolean(creds?.appKey && creds?.clientCode && hasUsableToken(creds?.accessToken, creds?.tokenExpiry));
    }
    return false;
  } catch (error) {
    console.error(`[BROKER] ${broker} connection validation failed:`, (error as any)?.message || error);
    return false;
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
  if (broker === "aliceblue") await clearAliceblueCredentials(userId);
  if (broker === "5paisa") await clearFivepaisaCredentials(userId);
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
      proxy: await makeBrokerProxy(userId, "angelone", ANGELONE_API),
      publicIp: await getUserOrderPlacementIP(userId).then((v) => v.ipAddress).catch(() => undefined),
    });
    return await saveAngelOneCredentials(userId, {
      jwtToken: session.jwtToken,
      refreshToken: session.refreshToken,
      feedToken: session.feedToken,
      tokenExpiry: angeloneTokenExpiry(session.jwtToken),
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
  const publicIp = await getUserOrderPlacementIP(userId).then((v) => v.ipAddress).catch(() => undefined);
  return new AngelOneService({ apiKey: creds.apiKey, jwtToken: creds.jwtToken, proxy, publicIp });
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

/**
 * Last-resort mapping: take a sibling contract of the SAME index + expiry that
 * already carries the broker's native symbol and swap the strike/option type.
 * Works for symbol-based brokers (Fyers, Zerodha, Groww) whose masters follow a
 * strict pattern, so an order still goes out when one strike is missing.
 */
export async function deriveBrokerSymbolFromSibling(row: any, col: string): Promise<string | null> {
  try {
    if (!row?.index_name || !row?.expiry_date || row?.strike_price == null || !row?.option_type) return null;
    const { data } = await supabaseAdmin
      .from("instrument_master")
      .select(`${col}, strike_price, option_type`)
      .eq("index_name", row.index_name)
      .eq("expiry_date", row.expiry_date)
      .not(col, "is", null)
      .limit(1)
      .maybeSingle();
    const sample = data?.[col] ? String(data[col]) : "";
    if (!sample) return null;
    const needle = `${Number(data!.strike_price)}${String(data!.option_type).toUpperCase()}`;
    if (!sample.toUpperCase().includes(needle)) return null;
    const derived = sample.toUpperCase().replace(needle, `${Number(row.strike_price)}${String(row.option_type).toUpperCase()}`);
    console.log(`[INSTRUMENT] derived ${col} ${derived} from sibling ${sample}`);
    return derived;
  } catch {
    return null;
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
    "angelone_tradingsymbol, angelone_symbol_token, angelone_exchange";

  const lookup = (): Promise<any> => findInstrumentRow(order, COLS);

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

// ───────────────────────── aliceblue credentials ─────────────────────────

export interface AliceblueStoredCreds {
  userId: string;              // Aliceblue client / user id (e.g. "AB1234")
  apiKey?: string;             // legacy ANT API key (direct login)
  appCode?: string;            // vendor App Code (from the developer portal)
  apiSecret?: string;          // vendor API secret
  authCode?: string;           // last authCode returned on the redirect
  sessionId?: string;          // session / userSession (bearer token)
  sessionDate?: string;        // IST date the session was minted for
  authMethod?: "vendor";
  tokenExpiry?: string | null;
  aliceblueName?: string;
  lastStatus?: string;
  lastError?: string | null;
  updatedAt?: string;
}

function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export async function getAliceblueCredentials(userId: string): Promise<AliceblueStoredCreds | null> {
  const creds = (await kv.get(`aliceblue_credentials:${userId}`)) as AliceblueStoredCreds | null;
  return creds || null;
}

export async function saveAliceblueCredentials(userId: string, patch: Partial<AliceblueStoredCreds>) {
  const existing = (await getAliceblueCredentials(userId)) || ({} as AliceblueStoredCreds);
  const merged = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  await kv.set(`aliceblue_credentials:${userId}`, merged);
  return merged;
}

export async function clearAliceblueCredentials(userId: string) {
  await kv.del(`aliceblue_credentials:${userId}`);
}

/**
 * Keep a usable Aliceblue bearer token.
 *  • Vendor flow (App Code + API secret): the `userSession` is long lived — reuse
 *    it, and re-derive it from the stored authCode when it is missing.
 *  • Legacy API-key flow: mint a fresh daily session.
 */
export async function ensureAliceblueSession(
  userId: string,
  opts: { force?: boolean } = {},
): Promise<AliceblueStoredCreds | null> {
  const creds = await getAliceblueCredentials(userId);
  if (!creds?.userId) return null;

  const vendor = !!(creds.apiSecret && creds.authCode);
  if (!vendor) return null;

  const expired = creds.tokenExpiry ? Date.parse(creds.tokenExpiry) <= Date.now() + 60_000 : false;
  if (creds.sessionId && !expired && !opts.force) return creds;

  try {
    if (vendor) {
      const session = await aliceblueVendorSession({
        userId: creds.userId,
        authCode: creds.authCode!,
        apiSecret: creds.apiSecret!,
      });
      return await saveAliceblueCredentials(userId, {
        sessionId: session.sessionId,
        tokenExpiry: aliceblueTokenExpiry(session.sessionId),
        sessionDate: istToday(),
        authMethod: "vendor",
        lastStatus: "connected",
        lastError: null,
      });
    }
    return null;
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error("[ALICEBLUE] auto re-login failed:", msg);
    await saveAliceblueCredentials(userId, { lastStatus: "login_failed", lastError: msg });
    return creds.sessionId ? creds : null;
  }
}


export async function getAliceblueService(userId: string): Promise<AliceblueService | null> {
  const creds = await ensureAliceblueSession(userId);
  if (!creds?.sessionId || !creds?.userId) return null;
  const proxy = await makeBrokerProxy(userId, "aliceblue", ALICEBLUE_API);
  return new AliceblueService({ userId: creds.userId, sessionId: creds.sessionId, proxy });
}

/** Non-secret mirror so the Broker screen can show Aliceblue status. */
export async function mirrorAliceblueStatus(userId: string, patch: Record<string, any>) {
  try {
    const { data: existing } = await supabaseAdmin
      .from("broker_credentials")
      .select("id")
      .eq("user_id", userId)
      .eq("broker", "aliceblue")
      .maybeSingle();
    const payload = { user_id: userId, broker: "aliceblue", auth_method: "vendor", ...patch };
    if (existing?.id) {
      await supabaseAdmin.from("broker_credentials").update(payload).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("broker_credentials").insert(payload);
    }
  } catch (e) {
    console.error("[ALICEBLUE] status mirror failed:", (e as any)?.message || e);
  }
}

/** Resolve a Dhan-style order into an Aliceblue trading symbol + instrument token. */
export async function resolveAliceblueSymbol(order: any): Promise<{
  tradingSymbol: string;
  symbolToken: string;
  exchange: "NFO" | "BFO";
  lotSize: number;
} | null> {
  const securityId = String(order?.securityId || "");
  const symbolText = String(order?.symbol || order?.tradingSymbol || "").trim();
  const COLS =
    "aliceblue_tradingsymbol, aliceblue_token, aliceblue_exchange";

  const lookup = (): Promise<any> => findInstrumentRow(order, COLS);

  let inst = await lookup();
  if (!inst?.aliceblue_token) {
    await ensureAliceblueInstruments(!!inst);
    const retry = await lookup();
    if (retry?.aliceblue_token) inst = retry;
  }

  if (!inst?.aliceblue_token) {
    // Position exits carry the Aliceblue token/symbol straight from Aliceblue positions.
    const token = String(order?.aliceblueToken || "").trim();
    if (token && symbolText) {
      return {
        tradingSymbol: symbolText.toUpperCase(),
        symbolToken: token,
        exchange: aliceblueExchangeFromSegment(order?.exchangeSegment),
        lotSize: Number(order?.lotSize || 0),
      };
    }
    return null;
  }

  return {
    tradingSymbol: String(inst.aliceblue_tradingsymbol || symbolText).toUpperCase(),
    symbolToken: String(inst.aliceblue_token),
    exchange: (String(inst.aliceblue_exchange || "").toUpperCase() === "BFO"
      ? "BFO"
      : aliceblueExchangeFromSegment(inst.exchange_segment)) as "NFO" | "BFO",
    lotSize: Number(inst.lot_size || 0),
  };
}

// ───────────────────────── 5paisa credentials ─────────────────────────

export interface FivepaisaStoredCreds {
  appKey: string;              // 5paisa App Key / Vendor Key
  encryptionKey?: string;      // Encryption Key from the API credentials
  userKey?: string;            // "UserId" from the API credentials (partner/user key)
  clientCode?: string;         // 5paisa demat client code (returned after login)
  clientName?: string;
  accessToken?: string;        // daily bearer token
  tokenExpiry?: string | null; // 11:59 PM IST the day it was minted
  redirectUri?: string;
  segments?: Record<string, string>;
  lastStatus?: string;
  lastError?: string | null;
  updatedAt?: string;
}

export async function getFivepaisaCredentials(userId: string): Promise<FivepaisaStoredCreds | null> {
  const creds = (await kv.get(`fivepaisa_credentials:${userId}`)) as FivepaisaStoredCreds | null;
  return creds || null;
}

export async function saveFivepaisaCredentials(userId: string, patch: Partial<FivepaisaStoredCreds>) {
  const existing = (await getFivepaisaCredentials(userId)) || ({} as FivepaisaStoredCreds);
  const merged = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  await kv.set(`fivepaisa_credentials:${userId}`, merged);
  return merged;
}

export async function clearFivepaisaCredentials(userId: string) {
  await kv.del(`fivepaisa_credentials:${userId}`);
}

/** A 5paisa access token dies at 11:59 PM IST — treat an expired one as no session. */
export async function ensureFivepaisaSession(userId: string): Promise<FivepaisaStoredCreds | null> {
  const creds = await getFivepaisaCredentials(userId);
  if (!creds?.accessToken || !creds?.appKey || !creds?.clientCode) return null;
  if (creds.tokenExpiry && Date.parse(creds.tokenExpiry) <= Date.now()) {
    await saveFivepaisaCredentials(userId, {
      lastStatus: "token_expired",
      lastError: "5paisa access tokens expire daily at 11:59 PM IST. Login again.",
    });
    return null;
  }
  return creds;
}

export async function getFivepaisaService(userId: string): Promise<FivepaisaService | null> {
  const creds = await ensureFivepaisaSession(userId);
  if (!creds) return null;
  const proxy = await makeBrokerProxy(userId, "5paisa", FIVEPAISA_API);
  return new FivepaisaService({
    accessToken: creds.accessToken!,
    appKey: creds.appKey,
    clientCode: creds.clientCode!,
    proxy,
  });
}

/** Non-secret mirror so the Broker screen can show 5paisa status. */
export async function mirrorFivepaisaStatus(userId: string, patch: Record<string, any>) {
  try {
    const { data: existing } = await supabaseAdmin
      .from("broker_credentials")
      .select("id")
      .eq("user_id", userId)
      .eq("broker", "5paisa")
      .maybeSingle();
    const payload = { user_id: userId, broker: "5paisa", auth_method: "oauth", ...patch };
    if (existing?.id) {
      await supabaseAdmin.from("broker_credentials").update(payload).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("broker_credentials").insert(payload);
    }
  } catch (e) {
    console.error("[5PAISA] status mirror failed:", (e as any)?.message || e);
  }
}

export async function resolveFivepaisaSymbol(order: any): Promise<{
  scripCode: string;
  scripData: string;
  exchange: "N" | "B";
  exchangeType: "C" | "D";
  lotSize: number;
} | null> {
  const securityId = String(order?.securityId || "");
  const symbolText = String(order?.symbol || order?.tradingSymbol || "").trim();
  const COLS =
    "fivepaisa_scrip_code, fivepaisa_scrip_data, fivepaisa_exchange";

  const lookup = (): Promise<any> => findInstrumentRow(order, COLS);

  let inst = await lookup();
  if (!inst?.fivepaisa_scrip_code) {
    await ensureFivepaisaInstruments(!!inst);
    const retry = await lookup();
    if (retry?.fivepaisa_scrip_code) inst = retry;
  }

  if (!inst?.fivepaisa_scrip_code) {
    // Position exits carry the 5paisa scrip code straight from 5paisa positions.
    const code = String(order?.fivepaisaScripCode || "").trim();
    if (code) {
      return {
        scripCode: code,
        scripData: String(order?.fivepaisaScripData || symbolText),
        exchange: fivepaisaExchangeFromSegment(order?.exchangeSegment),
        exchangeType: fivepaisaExchangeTypeFromSegment(order?.exchangeSegment),
        lotSize: Number(order?.lotSize || 0),
      };
    }
    return null;
  }

  return {
    scripCode: String(inst.fivepaisa_scrip_code),
    scripData: String(inst.fivepaisa_scrip_data || symbolText),
    exchange: (String(inst.fivepaisa_exchange || "").toUpperCase() === "B"
      ? "B"
      : fivepaisaExchangeFromSegment(inst.exchange_segment)) as "N" | "B",
    exchangeType: fivepaisaExchangeTypeFromSegment(inst.exchange_segment),
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
  if (creds.tokenExpiry && Date.parse(creds.tokenExpiry) <= Date.now() + 60_000) return null;
  const proxy = await makeBrokerProxy(userId, "fyers", FYERS_API);
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
  const COLS =
    "fyers_symbol, fyers_tradingsymbol";

  const lookup = (): Promise<any> => findInstrumentRow(order, COLS);

  let inst = await lookup();
  if (!inst?.fyers_symbol) {
    await ensureFyersInstruments(!!inst);
    const retry = await lookup();
    if (retry?.fyers_symbol) inst = retry;
  }

  if (inst && !inst.fyers_symbol) {
    const derived = await deriveBrokerSymbolFromSibling(inst, "fyers_symbol");
    if (derived) {
      return {
        fyersSymbol: derived,
        tradingSymbol: derived.split(":").pop() || derived,
        lotSize: Number(inst.lot_size || order?.lotSize || 0),
      };
    }
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
  const proxy = await makeBrokerProxy(userId, "upstox", UPSTOX_API);
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
  const COLS =
    "upstox_instrument_key, upstox_tradingsymbol";

  const lookup = (): Promise<any> => findInstrumentRow(order, COLS);

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
        signal: AbortSignal.timeout(4500),
      });
      if (resp.status === 404 || resp.status === 400) {
        // Old VPS image (no /broker-request) or unsupported broker → direct.
        // Flag it + fire a background self-update so the next order routes correctly.
        if (resp.status === 404) {
          console.warn(`[${broker.toUpperCase()}] VPS ${ip} has no /broker-request (legacy image) → direct API`);
          try {
            await kv.set(`vps_multibroker_unsupported:${ip}`, { at: Date.now(), broker });
            const { maybeAutoUpgradeVps } = await import("./static_ip_helper.tsx");
            maybeAutoUpgradeVps(ip, "0.0.0");
          } catch { /* never block an order */ }
        }
        return null;
      }

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
  const proxy = await makeBrokerProxy(userId, "groww", GROWW_API);
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
    "groww_trading_symbol, groww_exchange, groww_segment";

  const lookup = (): Promise<any> => findInstrumentRow(order, COLS);

  let inst = await lookup();
  if (!inst?.groww_trading_symbol) {
    await ensureGrowwInstruments(!!inst);
    const retry = await lookup();
    if (retry?.groww_trading_symbol) inst = retry;
  }

  if (inst && !inst.groww_trading_symbol) {
    const derived = await deriveBrokerSymbolFromSibling(inst, "groww_trading_symbol");
    if (derived) {
      const g = growwExchangeFromSegment(inst.exchange_segment || order?.exchangeSegment);
      return {
        tradingSymbol: derived,
        exchange: g.exchange,
        segment: g.segment,
        lotSize: Number(inst.lot_size || order?.lotSize || 0),
      };
    }
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

  const lookup = (): Promise<any> => findInstrumentRow(order, COLS);

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
/**
 * Public entry point. Wraps the per-broker logic so IP-whitelist rejections
 * (order left from the Supabase edge IP because the VPS proxy was unavailable)
 * come back as one clear, actionable message instead of a raw broker error.
 */
export async function placeOrderSmart(
  userId: string,
  dhanCredentials: { dhanClientId: string; dhanAccessToken: string },
  orderDetails: any,
): Promise<any> {
  try {
    const res = await placeOrderSmartInner(userId, dhanCredentials, orderDetails);
    const msg = String(res?.message || res?.raw?.message || "");
    if (res && res.success === false && /whitelist/i.test(msg)) {
      throw new Error(msg);
    }
    return res;
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (/whitelist/i.test(msg)) {
      let ip = "your VPS IP";
      try { ip = (await getUserOrderPlacementIP(userId))?.ipAddress || ip; } catch { /* ignore */ }
      const err: any = new Error(
        `VPS_ROUTING:Your broker rejected this order because it did not come from your static IP (${ip}). ` +
        `Your VPS order server is running an old image that can only proxy Dhan. ` +
        `Open Static IP / VPS → "Upgrade order server" (or POST /vps/upgrade) and run the upgrade, then retry. Broker said: ${msg}`,
      );
      err.code = "VPS_ROUTING";
      err.vpsIP = ip;
      throw err;
    }
    throw e;
  }
}

async function placeOrderSmartInner(

  userId: string,
  dhanCredentials: { dhanClientId: string; dhanAccessToken: string },
  orderDetails: any,
): Promise<any> {
  const broker = await getActiveBroker(userId);

  // 🟡 5PAISA
  if (broker === "5paisa") {
    const fpCreds = await ensureFivepaisaSession(userId);
    if (!fpCreds?.accessToken) {
      const err: any = new Error(
        "TOKEN_EXPIRED:5paisa is your active broker but no valid 5paisa session was found. Open Broker Setup → 5paisa and login again.",
      );
      err.code = "TOKEN_EXPIRED";
      throw err;
    }
    const fp = await resolveFivepaisaSymbol(orderDetails);
    if (!fp?.scripCode) {
      throw new Error("Could not map this contract to a 5paisa ScripCode. Refresh the instrument master and retry.");
    }
    const fpProxy = await makeBrokerProxy(userId, "5paisa", FIVEPAISA_API);
    const svcFp = new FivepaisaService({
      accessToken: fpCreds.accessToken,
      appKey: fpCreds.appKey,
      clientCode: fpCreds.clientCode!,
      proxy: fpProxy,
    });
    try {
      const res = await svcFp.placeOrder({
        scripCode: fp.scripCode,
        scripData: fp.scripData,
        exchange: fp.exchange,
        exchangeType: fp.exchangeType,
        transactionType: String(orderDetails.transactionType || "BUY").toUpperCase() as "BUY" | "SELL",
        quantity: Math.max(1, Number(orderDetails.quantity) || 0),
        isIntraday: fivepaisaIntradayFromDhan(orderDetails.productType),
        orderType: "MARKET",
      });
      return {
        success: !!res.orderId,
        orderId: res.orderId,
        exchangeOrderId: res.exchangeOrderId,
        remoteOrderId: res.remoteOrderId,
        orderStatus: res.orderId ? "PLACED" : "REJECTED",
        broker: "5paisa",
        routedVia: fpProxy ? "static-ip" : "edge",
        message: res.orderId ? "Order placed via 5paisa" : "5paisa order rejected",
        raw: res.raw,
      };
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (e?.code === "TOKEN_EXPIRED" || /token|session|unauthor|expired|invalid session/i.test(msg)) {
        const err: any = new Error(
          "TOKEN_EXPIRED:Your 5paisa session has expired (tokens reset at 11:59 PM IST). Connect again from Broker Setup → 5paisa.",
        );
        err.code = "TOKEN_EXPIRED";
        throw err;
      }
      throw new Error(msg);
    }
  }

  // 🔷 ALICEBLUE
  if (broker === "aliceblue") {
    const abCreds = await ensureAliceblueSession(userId);
    if (!abCreds?.sessionId || !abCreds?.userId) {
      const err: any = new Error(
        "TOKEN_EXPIRED:Aliceblue is your active broker but no valid Aliceblue session was found. Open Broker Setup → Aliceblue and connect again.",
      );
      err.code = "TOKEN_EXPIRED";
      throw err;
    }
    const ab = await resolveAliceblueSymbol(orderDetails);
    if (!ab?.symbolToken) {
      throw new Error("Could not map this contract to an Aliceblue token. Refresh the instrument master and retry.");
    }
    const abProxy = await makeBrokerProxy(userId, "aliceblue", ALICEBLUE_API);
    const svcAb = new AliceblueService({ userId: abCreds.userId, sessionId: abCreds.sessionId, proxy: abProxy });
    try {
      const res = await svcAb.placeOrder({
        tradingSymbol: ab.tradingSymbol,
        symbolToken: ab.symbolToken,
        exchange: ab.exchange,
        transactionType: String(orderDetails.transactionType || "BUY").toUpperCase() as "BUY" | "SELL",
        quantity: Math.max(1, Number(orderDetails.quantity) || 0),
        product: aliceblueProductFromDhan(orderDetails.productType),
        orderType: "MARKET",
        validity: "DAY",
      });
      return {
        success: !!res.orderId,
        orderId: res.orderId,
        orderStatus: res.orderId ? "PLACED" : "REJECTED",
        broker: "aliceblue",
        routedVia: abProxy ? "static-ip" : "edge",
        message: res.orderId ? "Order placed via Aliceblue" : "Aliceblue order rejected",
        raw: res.raw,
      };
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (/token|session|unauthor|expired|invalid session/i.test(msg)) {
        const err: any = new Error(
          "TOKEN_EXPIRED:Your Aliceblue session has expired (ANT sessions reset daily). Connect again from Broker Setup → Aliceblue.",
        );
        err.code = "TOKEN_EXPIRED";
        throw err;
      }
      throw new Error(msg);
    }
  }

  // 🔴 ANGEL ONE
  if (broker === "angelone") {
    const aCreds = await ensureAngelOneSession(userId);
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
    const fProxy = await makeBrokerProxy(userId, "fyers", FYERS_API);
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
    const uProxy = await makeBrokerProxy(userId, "upstox", UPSTOX_API);
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
    const gProxy = await makeBrokerProxy(userId, "groww", GROWW_API);
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
  if (broker === "5paisa") {
    const fp = await getFivepaisaService(userId);
    if (!fp) return [];
    try {
      return await fp.getPositions();
    } catch (e) {
      console.error("[5PAISA] positions failed:", (e as any)?.message || e);
      return [];
    }
  }
  if (broker === "aliceblue") {
    const ab = await getAliceblueService(userId);
    if (!ab) return [];
    try {
      return await ab.getPositions();
    } catch (e) {
      console.error("[ALICEBLUE] positions failed:", (e as any)?.message || e);
      return [];
    }
  }
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
  if (broker === "5paisa") {
    const fp = await getFivepaisaService(userId);
    if (!fp) return null;
    try {
      return await fp.getFundLimits();
    } catch (e) {
      console.error("[5PAISA] funds failed:", (e as any)?.message || e);
      return null;
    }
  }
  if (broker === "aliceblue") {
    const ab = await getAliceblueService(userId);
    if (!ab) return null;
    try {
      return await ab.getFundLimits();
    } catch (e) {
      console.error("[ALICEBLUE] funds failed:", (e as any)?.message || e);
      return null;
    }
  }
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
  if (broker === "5paisa") {
    const fp = await getFivepaisaService(userId);
    if (!fp) return null;
    const rfp = await resolveFivepaisaSymbol(order);
    if (!rfp) return null;
    return await fp.getLastPrice(rfp.exchange, rfp.exchangeType, rfp.scripCode);
  }
  if (broker === "aliceblue") {
    const ab = await getAliceblueService(userId);
    if (!ab) return null;
    const rab = await resolveAliceblueSymbol(order);
    if (!rab) return null;
    return await ab.getLastPrice(rab.exchange, rab.symbolToken);
  }
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
  if (broker === "5paisa") {
    const fp = await getFivepaisaService(userId);
    if (!fp) return null;
    try {
      const st = await fp.getOrderStatus(orderId);
      const raw = String(st?.OrderStatus || st?.Status || "").toUpperCase();
      const norm = raw.includes("FULLY") || raw === "COMPLETE" || raw === "EXECUTED"
        ? "COMPLETE"
        : raw.includes("REJECT")
          ? "REJECTED"
          : raw.includes("CANCEL")
            ? "CANCELLED"
            : raw || "PENDING";
      return {
        orderId: String(st?.BrokerOrderId ?? st?.BrokerOrderID ?? orderId),
        exchangeOrderId: st?.ExchOrderID ? String(st.ExchOrderID) : null,
        orderStatus: norm,
        tradedQuantity: Number(st?.TradedQty ?? st?.Qty ?? 0) - Number(st?.PendingQty ?? 0),
        averageTradedPrice: Number(st?.AveragePrice ?? st?.Rate ?? 0),
        broker: "5paisa",
        raw: st,
      };
    } catch (e) {
      console.error("[5PAISA] order status failed:", (e as any)?.message || e);
      return null;
    }
  }
  if (broker === "aliceblue") {
    const ab = await getAliceblueService(userId);
    if (!ab) return null;
    try {
      const st = await ab.getOrderStatus(orderId);
      const raw = String(st?.Status || st?.status || "").toUpperCase();
      return {
        orderId: String(st?.Nstordno || st?.nestordernumber || orderId),
        orderStatus: raw === "COMPLETE" ? "COMPLETE" : raw === "REJECTED" ? "REJECTED" : raw === "CANCELED" || raw === "CANCELLED" ? "CANCELLED" : raw || "PENDING",
        tradedQuantity: Number(st?.Fillshares ?? st?.filledShares ?? 0),
        averageTradedPrice: Number(st?.Avgprc ?? st?.averagePrice ?? 0),
        broker: "aliceblue",
        raw: st,
      };
    } catch (e) {
      console.error("[ALICEBLUE] order status failed:", (e as any)?.message || e);
      return null;
    }
  }
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
  if (broker === "5paisa") {
    const fp = await getFivepaisaService(userId);
    if (!fp) return false;
    return await fp.cancelOrder(orderId);
  }
  if (broker === "aliceblue") {
    const ab = await getAliceblueService(userId);
    if (!ab) return false;
    return await ab.cancelOrder(orderId);
  }
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

