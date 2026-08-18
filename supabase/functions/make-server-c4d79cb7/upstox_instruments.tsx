// @ts-nocheck
/**
 * 🟣 UPSTOX INSTRUMENT MASTER SYNC
 *
 * Docs: https://upstox.com/developer/api-documentation/instrument
 *
 * Upstox publishes the full instrument dump as public gzipped JSON (no auth):
 *   https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz
 *   https://assets.upstox.com/market-quote/instruments/exchange/BSE.json.gz
 *
 * We keep ONLY NIFTY / BANKNIFTY / SENSEX options for the NEAREST 2 expiries and
 * merge them into the SAME `instrument_master` table Dhan/Kite/Groww use, so one
 * contract row carries every broker's own symbol/key.
 *
 * 🔁 ONE DOWNLOAD FOR ALL USERS: cached in KV per IST date.
 */

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import * as kv from "./kv_store.tsx";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const DUMPS = [
  "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz",
  "https://assets.upstox.com/market-quote/instruments/exchange/BSE.json.gz",
];
const TARGET_UNDERLYINGS = new Set(["NIFTY", "BANKNIFTY", "SENSEX"]);
const SYNC_KEY = "upstox_instruments:last_sync";

function istDate(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

function toIsoDate(v: any): string {
  if (v == null) return "";
  if (typeof v === "number" || /^\d{10,13}$/.test(String(v))) {
    const ms = Number(v) < 1e12 ? Number(v) * 1000 : Number(v);
    return new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10);
  }
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

async function fetchGzJson(url: string): Promise<any[]> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Upstox dump failed (${url}): ${res.status}`);
  const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();
  const json = JSON.parse(text);
  return Array.isArray(json) ? json : [];
}

async function downloadUpstoxContracts(): Promise<any[]> {
  const today = istDate();
  const out: any[] = [];

  for (const url of DUMPS) {
    let rows: any[] = [];
    try {
      rows = await fetchGzJson(url);
    } catch (e) {
      console.error("[UPSTOX_INSTRUMENTS]", (e as any)?.message || e);
      continue;
    }

    for (const r of rows) {
      const type = String(r.instrument_type || r.option_type || "").toUpperCase();
      if (type !== "CE" && type !== "PE") continue;

      const name = String(r.underlying_symbol || r.asset_symbol || r.name || "")
        .toUpperCase()
        .replace(/[^A-Z]/g, "");
      if (!TARGET_UNDERLYINGS.has(name)) continue;

      const expiry = toIsoDate(r.expiry);
      if (!expiry || expiry < today) continue;

      const strike = Number(r.strike_price ?? r.strike);
      if (!isFinite(strike) || strike <= 0) continue;

      const key = String(r.instrument_key || "");
      if (!key) continue;

      const exchange = String(r.exchange || key.split("_")[0] || "NSE").toUpperCase().startsWith("BSE")
        ? "BSE"
        : "NSE";

      out.push({
        index_name: name,
        expiry_date: expiry,
        strike_price: strike,
        option_type: type,
        upstox_instrument_key: key,
        upstox_tradingsymbol: String(r.trading_symbol || r.tradingsymbol || "").toUpperCase(),
        upstox_exchange: exchange,
        lot_size: Math.max(1, parseInt(String(r.lot_size ?? 0), 10) || 1),
        tick_size: Number(r.tick_size) > 0 ? Number(r.tick_size) / (Number(r.tick_size) > 1 ? 100 : 1) : 0.05,
        exchange_segment: exchange === "BSE" ? "BSE_FNO" : "NSE_FNO",
      });
    }
  }

  return out;
}

/**
 * Download + merge Upstox contracts for NIFTY / BANKNIFTY / SENSEX
 * (nearest `expiries` expiries per index) into instrument_master.
 */
export async function syncUpstoxInstruments(opts: { force?: boolean; expiries?: number } = {}) {
  const startTs = Date.now();
  const keepCount = Math.max(1, opts.expiries ?? 2);
  const today = istDate();

  if (!opts.force) {
    const last = await kv.get(SYNC_KEY).catch(() => null);
    if (last?.date === today && Number(last?.count) > 0) {
      return { success: true, skipped: true, reason: "Already synced today", ...last };
    }
  }

  console.log("[UPSTOX_INSTRUMENTS] Downloading Upstox instrument dumps...");
  const all = await downloadUpstoxContracts();
  if (all.length === 0) throw new Error("Upstox instrument download returned no option contracts");

  const byIndex: Record<string, Set<string>> = {};
  for (const r of all) (byIndex[r.index_name] ||= new Set()).add(r.expiry_date);
  const keep: Record<string, Set<string>> = {};
  for (const [idx, exps] of Object.entries(byIndex)) {
    keep[idx] = new Set([...exps].sort().slice(0, keepCount));
  }

  const seen = new Set<string>();
  const filtered = all.filter((r) => {
    if (!keep[r.index_name]?.has(r.expiry_date)) return false;
    const k = `${r.index_name}|${r.expiry_date}|${r.option_type}|${r.strike_price}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  console.log(`[UPSTOX_INSTRUMENTS] Merging ${filtered.length} near-expiry contracts...`);

  let updated = 0;
  let inserted = 0;
  const CHUNK = 500;
  for (let i = 0; i < filtered.length; i += CHUNK) {
    const batch = filtered.slice(i, i + CHUNK);
    const { data, error } = await supabase.rpc("apply_upstox_instruments", { _rows: batch });
    if (error) {
      console.error("[UPSTOX_INSTRUMENTS] merge error:", error.message);
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    updated += Number(row?.updated_count || 0);
    inserted += Number(row?.inserted_count || 0);
  }

  const result = {
    success: true,
    date: today,
    count: filtered.length,
    updated,
    inserted,
    expiries: Object.fromEntries(Object.entries(keep).map(([k, v]) => [k, [...v].sort()])),
    duration_ms: Date.now() - startTs,
  };
  await kv.set(SYNC_KEY, result).catch(() => {});
  console.log(`[UPSTOX_INSTRUMENTS] ✅ ${filtered.length} contracts (updated ${updated}, inserted ${inserted}) in ${result.duration_ms}ms`);
  return result;
}

/** Has the Upstox mapping been built for today? */
export async function getUpstoxInstrumentStatus() {
  const last = await kv.get(SYNC_KEY).catch(() => null);
  const { count } = await supabase
    .from("instrument_master")
    .select("id", { count: "exact", head: true })
    .not("upstox_instrument_key", "is", null);
  return {
    lastSync: last || null,
    mappedContracts: count || 0,
    freshToday: last?.date === istDate(),
  };
}

/** Fire-and-forget sync used when a user switches to Upstox (shared by all users). */
export async function ensureUpstoxInstruments(force = false) {
  try {
    return await syncUpstoxInstruments({ force });
  } catch (e: any) {
    console.error("[UPSTOX_INSTRUMENTS] ensure failed:", e?.message || e);
    return { success: false, error: e?.message || String(e) };
  }
}
