/**
 * 🛰️ CENTRAL MARKET DATA + SIGNAL CENTER
 *
 * Problem solved: every user used to fetch index candles with THEIR OWN Dhan
 * data subscription and run the strategy locally. Different tokens / timings /
 * per-user cooldown state produced DIFFERENT signals for the same candle
 * (one user got BUY_PUT, another got WAIT).
 *
 * Solution: ONE admin Dhan data subscription (client id + access token stored in
 * `market_data_credentials`) fetches index candles ONCE per candle, and the
 * strategy runs ONCE per index per candle. Every user then reads the exact same
 * cached candles + signal — no rate limits, no mismatch.
 *
 * IMPORTANT: this module is READ-ONLY market data. Orders, positions, funds and
 * everything else still use each user's own broker token — unchanged.
 */

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { DhanService } from "./dhan_service.tsx";
import * as kv from "./kv_store.tsx";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
);

export interface CentralCreds {
  clientId: string;
  accessToken: string;
  enabled: boolean;
}

// ---------- credentials (cached inside the isolate for 60s) ----------
let credsCache: { value: CentralCreds | null; at: number } = { value: null, at: 0 };
const CREDS_TTL_MS = 60_000;

export async function getCentralCredentials(force = false): Promise<CentralCreds | null> {
  if (!force && Date.now() - credsCache.at < CREDS_TTL_MS) return credsCache.value;
  try {
    const { data, error } = await supabaseAdmin.rpc("get_market_data_credentials");
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    const value: CentralCreds | null =
      row?.dhan_client_id && row?.access_token && row?.enabled !== false
        ? { clientId: String(row.dhan_client_id), accessToken: String(row.access_token), enabled: true }
        : null;
    credsCache = { value, at: Date.now() };
    return value;
  } catch (e) {
    console.error("[CENTRAL] credential load failed:", (e as any)?.message || e);
    credsCache = { value: null, at: Date.now() };
    return null;
  }
}

export function invalidateCentralCredentials() {
  credsCache = { value: null, at: 0 };
}

export async function markCentralStatus(status: string, lastError?: string | null) {
  try {
    await supabaseAdmin
      .from("market_data_credentials")
      .update({
        status,
        last_error: lastError || null,
        last_verified_at: new Date().toISOString(),
      })
      .eq("id", 1);
  } catch (_e) {
    /* best effort */
  }
}

// ---------- shared OHLC cache ----------
type Candle = { timestamp: number; open: number; high: number; low: number; close: number; volume: number };

const memCache = new Map<string, { data: Candle[]; at: number }>();
const inflight = new Map<string, Promise<Candle[]>>();
const MEM_TTL_MS = 20_000;

function boundaryKey(intervalMin: number): number {
  const ms = Math.max(1, intervalMin) * 60 * 1000;
  return Math.floor(Date.now() / ms);
}

/**
 * Fetch index OHLC using the ADMIN data subscription. Falls back to the caller's
 * own Dhan service when the central credentials are missing / failing, so nothing
 * breaks for existing users while the admin token is not configured.
 */
export async function getCentralOHLC(
  securityId: string,
  interval: string,
  count: number,
  fallback?: DhanService | null,
): Promise<{ candles: Candle[]; source: "central" | "user" | "none" }> {
  const tf = parseInt(interval, 10) || 15;
  const key = `${securityId}:${tf}:${count}:${boundaryKey(tf)}`;

  const mem = memCache.get(key);
  if (mem && Date.now() - mem.at < MEM_TTL_MS && mem.data.length > 0) {
    return { candles: mem.data, source: "central" };
  }

  const running = inflight.get(key);
  if (running) {
    const candles = await running;
    if (candles.length > 0) return { candles, source: "central" };
  }

  const creds = await getCentralCredentials();
  if (creds) {
    const task = (async () => {
      try {
        const svc = new DhanService({ clientId: creds.clientId, accessToken: creds.accessToken });
        const candles = (await svc.getOHLCData(securityId, String(tf), count)) || [];
        if (candles.length > 0) {
          memCache.set(key, { data: candles, at: Date.now() });
          // cross-isolate cache so parallel invocations reuse the same bars
          await kv.set(`central_ohlc:${key}`, { candles, at: Date.now() }).catch(() => {});
          await markCentralStatus("active", null);
        }
        return candles;
      } catch (e) {
        const msg = (e as any)?.message || String(e);
        console.error(`[CENTRAL] OHLC ${securityId}/${tf}m failed:`, msg);
        await markCentralStatus("error", msg);
        return [] as Candle[];
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, task);
    const candles = await task;
    if (candles.length > 0) return { candles, source: "central" };

    // cross-isolate cached copy from a sibling invocation
    const cached = await kv.get(`central_ohlc:${key}`).catch(() => null);
    if (cached?.candles?.length) return { candles: cached.candles, source: "central" };
  }

  if (fallback) {
    try {
      const candles = (await fallback.getOHLCData(securityId, String(tf), count)) || [];
      if (candles.length > 0) return { candles, source: "user" };
    } catch (e) {
      console.error(`[CENTRAL] user-token OHLC fallback failed for ${securityId}:`, (e as any)?.message || e);
    }
  }

  return { candles: [], source: "none" };
}

// ---------- shared signal cache ----------
const signalMem = new Map<string, { signal: any; at: number }>();

function istTradingDate(nowMs = Date.now()): string {
  const ist = new Date(nowMs + 5.5 * 60 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
}

export function centralSignalKey(indexName: string, tf: number, candleStamp: string) {
  // A clock stamp such as 09:30 repeats every day. Without the trading date,
  // yesterday's signal was reused indefinitely for today's matching candle.
  return `central_signal:${istTradingDate()}:${indexName}:${tf}:${candleStamp}`;
}

export async function getCachedCentralSignal(indexName: string, tf: number, candleStamp: string) {
  const key = centralSignalKey(indexName, tf, candleStamp);
  const mem = signalMem.get(key);
  if (mem) return mem.signal;
  const stored = await kv.get(key).catch(() => null);
  if (stored?.signal) {
    signalMem.set(key, { signal: stored.signal, at: Date.now() });
    return stored.signal;
  }
  return null;
}

export async function saveCentralSignal(indexName: string, tf: number, candleStamp: string, signal: any) {
  const key = centralSignalKey(indexName, tf, candleStamp);
  const at = Date.now();
  const tradingDate = istTradingDate(at);
  signalMem.set(key, { signal, at });
  await kv.set(key, { signal, at, tradingDate }).catch(() => {});
  await kv.set(`central_signal_latest:${indexName}:${tf}`, { signal, candleStamp, at, tradingDate }).catch(() => {});
}

export async function getLatestCentralSignal(indexName: string, tf: number) {
  const latest = await kv.get(`central_signal_latest:${indexName}:${tf}`).catch(() => null);
  if (!latest || latest.tradingDate !== istTradingDate()) return null;
  return latest;
}

/** Verify admin data credentials by pulling a small NIFTY candle set. */
export async function testCentralCredentials(
  clientId: string,
  accessToken: string,
): Promise<{ ok: boolean; candles: number; error?: string }> {
  try {
    const svc = new DhanService({ clientId, accessToken });
    const candles = (await svc.getOHLCData("13", "15", 5)) || [];
    if (candles.length === 0) return { ok: false, candles: 0, error: "No candles returned by Dhan" };
    return { ok: true, candles: candles.length };
  } catch (e) {
    return { ok: false, candles: 0, error: (e as any)?.message || String(e) };
  }
}
