// @ts-nocheck
/**
 * 🟢 GROWW INSTRUMENT MASTER SYNC
 *
 * Docs: https://groww.in/trade-api/docs/curl/instruments
 *
 * Groww publishes the full instrument dump as a public CSV (no auth needed):
 *   https://growwapi-assets.groww.in/instruments/instrument.csv
 *
 * We keep ONLY NIFTY / BANKNIFTY / SENSEX options for the NEAREST 2 expiries and
 * merge them into the SAME `instrument_master` table Dhan/Kite use, so one
 * contract row carries the Dhan `security_id`, the Kite `kite_tradingsymbol`
 * and the Groww `groww_trading_symbol`.
 *
 * 🔁 ONE DOWNLOAD FOR ALL USERS: the result is cached in KV per IST date, so the
 * dump is fetched at most once a day globally (not per user), and every user's
 * trade execution reads the same shared mapping.
 */

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import * as kv from "./kv_store.tsx";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const GROWW_CSV = "https://growwapi-assets.groww.in/instruments/instrument.csv";
const TARGET_UNDERLYINGS = new Set(["NIFTY", "BANKNIFTY", "SENSEX"]);
const SYNC_KEY = "groww_instruments:last_sync";

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function istDate(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

async function downloadGrowwContracts(): Promise<any[]> {
  const res = await fetch(GROWW_CSV);
  if (!res.ok) throw new Error(`Groww instrument dump failed: ${res.status}`);
  const text = await res.text();
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) throw new Error("Groww dump empty");

  const header = parseCsvRow(lines[0]).map((h) => h.toLowerCase());
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const cSymbol = col("trading_symbol", "tradingsymbol");
  const cName = col("underlying_symbol", "name");
  const cExpiry = col("expiry_date", "expiry");
  const cStrike = col("strike_price", "strike");
  const cType = col("instrument_type", "option_type");
  const cLot = col("lot_size", "lotsize");
  const cTick = col("tick_size", "ticksize");
  const cExch = col("exchange");
  const cSeg = col("segment");

  if (cSymbol < 0 || cExpiry < 0 || cStrike < 0 || cType < 0) {
    throw new Error("Groww dump: unexpected columns");
  }

  const today = istDate();
  const out: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length < 10) continue;
    const cols = parseCsvRow(line);

    const optType = (cols[cType] || "").toUpperCase();
    if (optType !== "CE" && optType !== "PE") continue;

    const name = (cols[cName] || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (!TARGET_UNDERLYINGS.has(name)) continue;

    const expiry = (cols[cExpiry] || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || expiry < today) continue;

    const strike = Number(cols[cStrike]);
    if (!isFinite(strike) || strike <= 0) continue;

    const exchange = (cols[cExch] || (name === "SENSEX" ? "BSE" : "NSE")).toUpperCase();

    out.push({
      index_name: name,
      expiry_date: expiry,
      strike_price: strike,
      option_type: optType,
      groww_trading_symbol: (cols[cSymbol] || "").toUpperCase(),
      groww_exchange: exchange,
      groww_segment: (cols[cSeg] || "FNO").toUpperCase(),
      lot_size: Math.max(1, parseInt(cols[cLot] || "0", 10) || 1),
      tick_size: Number(cols[cTick]) || 0.05,
      exchange_segment: exchange === "BSE" ? "BSE_FNO" : "NSE_FNO",
    });
  }

  return out;
}

/**
 * Download + merge Groww contracts for NIFTY / BANKNIFTY / SENSEX
 * (nearest `expiries` expiries per index) into instrument_master.
 */
export async function syncGrowwInstruments(opts: { force?: boolean; expiries?: number } = {}) {
  const startTs = Date.now();
  const keepCount = Math.max(1, opts.expiries ?? 2);
  const today = istDate();

  if (!opts.force) {
    const last = await kv.get(SYNC_KEY).catch(() => null);
    if (last?.date === today && Number(last?.count) > 0) {
      return { success: true, skipped: true, reason: "Already synced today", ...last };
    }
  }

  console.log("[GROWW_INSTRUMENTS] Downloading Groww instrument dump...");
  const all = await downloadGrowwContracts();
  if (all.length === 0) throw new Error("Groww instrument download returned no option contracts");

  // Keep only the nearest N expiries per index (near-expiry contracts only).
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

  console.log(`[GROWW_INSTRUMENTS] Merging ${filtered.length} near-expiry contracts...`);

  let updated = 0;
  let inserted = 0;
  const CHUNK = 500;
  for (let i = 0; i < filtered.length; i += CHUNK) {
    const batch = filtered.slice(i, i + CHUNK);
    const { data, error } = await supabase.rpc("apply_groww_instruments", { _rows: batch });
    if (error) {
      console.error("[GROWW_INSTRUMENTS] merge error:", error.message);
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
  console.log(`[GROWW_INSTRUMENTS] ✅ ${filtered.length} contracts (updated ${updated}, inserted ${inserted}) in ${result.duration_ms}ms`);
  return result;
}

/** Has the Groww mapping been built for today? */
export async function getGrowwInstrumentStatus() {
  const last = await kv.get(SYNC_KEY).catch(() => null);
  const { count } = await supabase
    .from("instrument_master")
    .select("id", { count: "exact", head: true })
    .not("groww_trading_symbol", "is", null);
  return {
    lastSync: last || null,
    mappedContracts: count || 0,
    freshToday: last?.date === istDate(),
  };
}

/** Fire-and-forget sync used when a user switches to Groww (shared by all users). */
export async function ensureGrowwInstruments(force = false) {
  try {
    return await syncGrowwInstruments({ force });
  } catch (e: any) {
    console.error("[GROWW_INSTRUMENTS] ensure failed:", e?.message || e);
    return { success: false, error: e?.message || String(e) };
  }
}
