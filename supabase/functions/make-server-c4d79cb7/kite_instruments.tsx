// @ts-nocheck
/**
 * 🟠 ZERODHA KITE INSTRUMENT MASTER SYNC
 *
 * Docs: https://kite.trade/docs/connect/v3/market-quotes/#instruments
 *
 * Zerodha publishes the full instrument dump as a public CSV (no auth needed):
 *   https://api.kite.trade/instruments/NFO   → NIFTY / BANKNIFTY options
 *   https://api.kite.trade/instruments/BFO   → SENSEX options
 *
 * We only keep NIFTY / BANKNIFTY / SENSEX options for the NEAREST 2 expiries and
 * merge them into the SAME `instrument_master` table the Dhan pipeline uses, so
 * one contract row carries both the Dhan `security_id` and the Kite
 * `kite_tradingsymbol` / `kite_instrument_token`.
 *
 * Dhan stays the default broker — this sync runs when a user switches to
 * Zerodha (and on demand / daily), never touching the Dhan columns.
 */

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import * as kv from "./kv_store.tsx";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const KITE_INSTRUMENTS = {
  NFO: "https://api.kite.trade/instruments/NFO",
  BFO: "https://api.kite.trade/instruments/BFO",
};

const TARGET_UNDERLYINGS = new Set(["NIFTY", "BANKNIFTY", "SENSEX"]);
const SYNC_KEY = "kite_instruments:last_sync";

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

export interface KiteContract {
  index_name: string;
  expiry_date: string;
  strike_price: number;
  option_type: "CE" | "PE";
  kite_tradingsymbol: string;
  kite_instrument_token: string;
  kite_exchange: string;
  lot_size: number;
  tick_size: number;
  exchange_segment: string;
}

async function downloadExchange(exchange: "NFO" | "BFO"): Promise<KiteContract[]> {
  const res = await fetch(KITE_INSTRUMENTS[exchange], {
    headers: { "X-Kite-Version": "3" },
  });
  if (!res.ok) throw new Error(`Kite ${exchange} instrument dump failed: ${res.status}`);
  const text = await res.text();
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) throw new Error(`Kite ${exchange} dump empty`);

  const header = parseCsvRow(lines[0]).map((h) => h.toLowerCase());
  const col = (n: string) => header.indexOf(n);
  const cToken = col("instrument_token");
  const cSymbol = col("tradingsymbol");
  const cName = col("name");
  const cExpiry = col("expiry");
  const cStrike = col("strike");
  const cTick = col("tick_size");
  const cLot = col("lot_size");
  const cType = col("instrument_type");
  const cExch = col("exchange");

  if (cToken < 0 || cSymbol < 0 || cExpiry < 0 || cStrike < 0 || cType < 0) {
    throw new Error(`Kite ${exchange} dump: unexpected columns`);
  }

  const today = istDate();
  const out: KiteContract[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length < 10) continue;
    const cols = parseCsvRow(line);

    const optType = (cols[cType] || "").toUpperCase();
    if (optType !== "CE" && optType !== "PE") continue;

    const name = (cols[cName] || "").toUpperCase();
    if (!TARGET_UNDERLYINGS.has(name)) continue;

    const expiry = (cols[cExpiry] || "").slice(0, 10);
    if (!expiry || expiry < today) continue;

    const strike = Number(cols[cStrike]);
    if (!isFinite(strike) || strike <= 0) continue;

    out.push({
      index_name: name,
      expiry_date: expiry,
      strike_price: strike,
      option_type: optType as "CE" | "PE",
      kite_tradingsymbol: (cols[cSymbol] || "").toUpperCase(),
      kite_instrument_token: String(cols[cToken] || "").trim(),
      kite_exchange: (cols[cExch] || exchange).toUpperCase(),
      lot_size: Math.max(1, parseInt(cols[cLot] || "0", 10) || 1),
      tick_size: Number(cols[cTick]) || 0.05,
      exchange_segment: exchange === "BFO" ? "BSE_FNO" : "NSE_FNO",
    });
  }

  return out;
}

/**
 * Download + merge Zerodha contracts for NIFTY / BANKNIFTY / SENSEX
 * (nearest `expiries` expiries per index) into instrument_master.
 */
export async function syncKiteInstruments(opts: { force?: boolean; expiries?: number } = {}) {
  const startTs = Date.now();
  const keepCount = Math.max(1, opts.expiries ?? 2);
  const today = istDate();

  if (!opts.force) {
    const last = await kv.get(SYNC_KEY).catch(() => null);
    if (last?.date === today && Number(last?.count) > 0) {
      return { success: true, skipped: true, reason: "Already synced today", ...last };
    }
  }

  console.log("[KITE_INSTRUMENTS] Downloading Zerodha instrument dumps (NFO + BFO)...");
  const [nfo, bfo] = await Promise.all([
    downloadExchange("NFO").catch((e) => { console.error("[KITE_INSTRUMENTS] NFO:", e.message); return []; }),
    downloadExchange("BFO").catch((e) => { console.error("[KITE_INSTRUMENTS] BFO:", e.message); return []; }),
  ]);
  const all = [...nfo, ...bfo];
  if (all.length === 0) throw new Error("Zerodha instrument download returned no option contracts");

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

  console.log(`[KITE_INSTRUMENTS] Merging ${filtered.length} near-expiry contracts...`);

  let updated = 0;
  let inserted = 0;
  const CHUNK = 500;
  for (let i = 0; i < filtered.length; i += CHUNK) {
    const batch = filtered.slice(i, i + CHUNK);
    const { data, error } = await supabase.rpc("apply_kite_instruments", { _rows: batch });
    if (error) {
      console.error("[KITE_INSTRUMENTS] merge error:", error.message);
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
  console.log(`[KITE_INSTRUMENTS] ✅ ${filtered.length} contracts (updated ${updated}, inserted ${inserted}) in ${result.duration_ms}ms`);
  return result;
}

/** Has the Zerodha mapping been built for today? */
export async function getKiteInstrumentStatus() {
  const last = await kv.get(SYNC_KEY).catch(() => null);
  const { count } = await supabase
    .from("instrument_master")
    .select("id", { count: "exact", head: true })
    .not("kite_tradingsymbol", "is", null);
  return {
    lastSync: last || null,
    mappedContracts: count || 0,
    freshToday: last?.date === istDate(),
  };
}

/** Fire-and-forget sync used when a user switches to Zerodha. */
export async function ensureKiteInstruments(force = false) {
  try {
    return await syncKiteInstruments({ force });
  } catch (e: any) {
    console.error("[KITE_INSTRUMENTS] ensure failed:", e?.message || e);
    return { success: false, error: e?.message || String(e) };
  }
}
