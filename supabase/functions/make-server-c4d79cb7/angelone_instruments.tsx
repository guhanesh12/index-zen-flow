// @ts-nocheck
/**
 * 🔴 ANGEL ONE INSTRUMENT MASTER SYNC
 *
 * Docs: https://smartapi.angelbroking.com/docs/Instruments
 *
 * Angel One publishes the full scrip master as public JSON (no auth):
 *   https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json
 *
 * We keep ONLY NIFTY / BANKNIFTY / SENSEX options for the NEAREST 2 expiries and
 * merge them into the SAME `instrument_master` table Dhan/Kite/Groww/Upstox/Fyers use,
 * so one contract row carries every broker's own symbol/token.
 *
 * 🔁 ONE DOWNLOAD FOR ALL USERS: cached in KV per IST date.
 */

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import * as kv from "./kv_store.tsx";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SCRIP_MASTER =
  "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json";
const TARGET_UNDERLYINGS = new Set(["NIFTY", "BANKNIFTY", "SENSEX"]);
const SYNC_KEY = "angelone_instruments:last_sync";

const MONTHS: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

function istDate(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

/** Angel One expiry is "28AUG2025" → "2025-08-28". */
function toIsoDate(v: any): string {
  const s = String(v || "").trim().toUpperCase();
  const m = s.match(/^(\d{2})([A-Z]{3})(\d{4})$/);
  if (m && MONTHS[m[2]]) return `${m[3]}-${MONTHS[m[2]]}-${m[1]}`;
  const iso = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : "";
}

async function downloadAngelOneContracts(): Promise<any[]> {
  const today = istDate();
  const res = await fetch(SCRIP_MASTER);
  if (!res.ok) throw new Error(`Angel One scrip master failed: ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error("Angel One scrip master returned an unexpected payload");

  const out: any[] = [];
  for (const r of rows) {
    const instType = String(r?.instrumenttype || "").toUpperCase();
    if (instType !== "OPTIDX") continue;

    const exch = String(r?.exch_seg || "").toUpperCase();
    if (exch !== "NFO" && exch !== "BFO") continue;

    const name = String(r?.name || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (!TARGET_UNDERLYINGS.has(name)) continue;

    const expiry = toIsoDate(r?.expiry);
    if (!expiry || expiry < today) continue;

    const tradingSymbol = String(r?.symbol || "").toUpperCase();
    const type = tradingSymbol.endsWith("CE") ? "CE" : tradingSymbol.endsWith("PE") ? "PE" : "";
    if (!type) continue;

    // strike arrives in paise (e.g. "2420000.000000" → 24200)
    const rawStrike = Number(r?.strike);
    const strike = isFinite(rawStrike) ? rawStrike / 100 : NaN;
    if (!isFinite(strike) || strike <= 0) continue;

    const token = String(r?.token || "").trim();
    if (!token) continue;

    const rawTick = Number(r?.tick_size);
    const tick = isFinite(rawTick) && rawTick > 0 ? rawTick / 100 : 0.05;

    out.push({
      index_name: name,
      expiry_date: expiry,
      strike_price: strike,
      option_type: type,
      angelone_tradingsymbol: tradingSymbol,
      angelone_symbol_token: token,
      angelone_exchange: exch,
      lot_size: Math.max(1, parseInt(String(r?.lotsize ?? 0), 10) || 1),
      tick_size: tick,
      exchange_segment: exch === "BFO" ? "BSE_FNO" : "NSE_FNO",
    });
  }
  return out;
}

/**
 * Download + merge Angel One contracts for NIFTY / BANKNIFTY / SENSEX
 * (nearest `expiries` expiries per index) into instrument_master.
 */
export async function syncAngelOneInstruments(opts: { force?: boolean; expiries?: number } = {}) {
  const startTs = Date.now();
  const keepCount = Math.max(1, opts.expiries ?? 2);
  const today = istDate();

  if (!opts.force) {
    const last = await kv.get(SYNC_KEY).catch(() => null);
    if (last?.date === today && Number(last?.count) > 0) {
      return { success: true, skipped: true, reason: "Already synced today", ...last };
    }
  }

  console.log("[ANGELONE_INSTRUMENTS] Downloading Angel One scrip master...");
  const all = await downloadAngelOneContracts();
  if (all.length === 0) throw new Error("Angel One instrument download returned no option contracts");

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

  console.log(`[ANGELONE_INSTRUMENTS] Merging ${filtered.length} near-expiry contracts...`);

  let updated = 0;
  let inserted = 0;
  const CHUNK = 500;
  for (let i = 0; i < filtered.length; i += CHUNK) {
    const batch = filtered.slice(i, i + CHUNK);
    const { data, error } = await supabase.rpc("apply_angelone_instruments", { _rows: batch });
    if (error) {
      console.error("[ANGELONE_INSTRUMENTS] merge error:", error.message);
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
  console.log(`[ANGELONE_INSTRUMENTS] ✅ ${filtered.length} contracts (updated ${updated}, inserted ${inserted}) in ${result.duration_ms}ms`);
  return result;
}

/** Has the Angel One mapping been built for today? */
export async function getAngelOneInstrumentStatus() {
  const last = await kv.get(SYNC_KEY).catch(() => null);
  const { count } = await supabase
    .from("instrument_master")
    .select("id", { count: "exact", head: true })
    .not("angelone_symbol_token", "is", null);
  return {
    lastSync: last || null,
    mappedContracts: count || 0,
    freshToday: last?.date === istDate(),
  };
}

/** Fire-and-forget sync used when a user switches to Angel One (shared by all users). */
export async function ensureAngelOneInstruments(force = false) {
  try {
    return await syncAngelOneInstruments({ force });
  } catch (e: any) {
    console.error("[ANGELONE_INSTRUMENTS] ensure failed:", e?.message || e);
    return { success: false, error: e?.message || String(e) };
  }
}
