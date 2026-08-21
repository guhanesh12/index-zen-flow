// @ts-nocheck
/**
 * 🔵 FYERS INSTRUMENT MASTER SYNC
 *
 * Docs: https://myapi.fyers.in/docsv3#tag/Broker-Config
 *
 * Fyers publishes the full contract master as public JSON (no auth):
 *   https://public.fyers.in/sym_details/NSE_FO_sym_master.json
 *   https://public.fyers.in/sym_details/BSE_FO_sym_master.json
 *
 * We keep ONLY NIFTY / BANKNIFTY / SENSEX options for the NEAREST 2 expiries and
 * merge them into the SAME `instrument_master` table Dhan/Kite/Groww/Upstox use,
 * so one contract row carries every broker's own symbol/key.
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
  "https://public.fyers.in/sym_details/NSE_FO_sym_master.json",
  "https://public.fyers.in/sym_details/BSE_FO_sym_master.json",
];
const TARGET_UNDERLYINGS = new Set(["NIFTY", "BANKNIFTY", "SENSEX"]);
const SYNC_KEY = "fyers_instruments:last_sync";

function istDate(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

function toIsoDate(v: any): string {
  if (v == null) return "";
  if (typeof v === "number" || /^\d{9,13}$/.test(String(v))) {
    const ms = Number(v) < 1e12 ? Number(v) * 1000 : Number(v);
    return new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10);
  }
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

async function fetchJson(url: string): Promise<Record<string, any>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fyers master failed (${url}): ${res.status}`);
  const json = await res.json();
  return json && typeof json === "object" ? json : {};
}

async function downloadFyersContracts(): Promise<any[]> {
  const today = istDate();
  const out: any[] = [];

  for (const url of DUMPS) {
    let map: Record<string, any> = {};
    try {
      map = await fetchJson(url);
    } catch (e) {
      console.error("[FYERS_INSTRUMENTS]", (e as any)?.message || e);
      continue;
    }

    for (const [symbol, r] of Object.entries<any>(map)) {
      const type = String(r?.optType || r?.option_type || "").toUpperCase();
      if (type !== "CE" && type !== "PE") continue;

      const name = String(r?.underSym || r?.underlying_symbol || "")
        .toUpperCase()
        .replace(/[^A-Z]/g, "");
      if (!TARGET_UNDERLYINGS.has(name)) continue;

      const expiry = toIsoDate(r?.expiryDate ?? r?.expiry_date);
      if (!expiry || expiry < today) continue;

      const strike = Number(r?.strikePrice ?? r?.strike_price);
      if (!isFinite(strike) || strike <= 0) continue;

      const fySymbol = String(r?.symTicker || symbol || "").toUpperCase();
      if (!fySymbol) continue;

      const exchange = fySymbol.startsWith("BSE") ? "BSE" : "NSE";
      const tick = Number(r?.tickSize ?? r?.tick_size);

      out.push({
        index_name: name,
        expiry_date: expiry,
        strike_price: strike,
        option_type: type,
        fyers_symbol: fySymbol,
        fyers_tradingsymbol: String(r?.exSymbol || fySymbol.split(":").pop() || "").toUpperCase(),
        fyers_exchange: exchange,
        lot_size: Math.max(1, parseInt(String(r?.minLotSize ?? r?.lot_size ?? 0), 10) || 1),
        tick_size: isFinite(tick) && tick > 0 ? (tick > 1 ? tick / 100 : tick) : 0.05,
        exchange_segment: exchange === "BSE" ? "BSE_FNO" : "NSE_FNO",
      });
    }
  }

  return out;
}

/**
 * Download + merge Fyers contracts for NIFTY / BANKNIFTY / SENSEX
 * (nearest `expiries` expiries per index) into instrument_master.
 */
export async function syncFyersInstruments(opts: { force?: boolean; expiries?: number } = {}) {
  const startTs = Date.now();
  const keepCount = Math.max(1, opts.expiries ?? 2);
  const today = istDate();

  if (!opts.force) {
    const last = await kv.get(SYNC_KEY).catch(() => null);
    if (last?.date === today && Number(last?.count) > 0) {
      return { success: true, skipped: true, reason: "Already synced today", ...last };
    }
  }

  console.log("[FYERS_INSTRUMENTS] Downloading Fyers symbol masters...");
  const all = await downloadFyersContracts();
  if (all.length === 0) throw new Error("Fyers instrument download returned no option contracts");

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

  console.log(`[FYERS_INSTRUMENTS] Merging ${filtered.length} near-expiry contracts...`);

  let updated = 0;
  let inserted = 0;
  const CHUNK = 500;
  for (let i = 0; i < filtered.length; i += CHUNK) {
    const batch = filtered.slice(i, i + CHUNK);
    const { data, error } = await supabase.rpc("apply_fyers_instruments", { _rows: batch });
    if (error) {
      console.error("[FYERS_INSTRUMENTS] merge error:", error.message);
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
  console.log(`[FYERS_INSTRUMENTS] ✅ ${filtered.length} contracts (updated ${updated}, inserted ${inserted}) in ${result.duration_ms}ms`);
  return result;
}

/** Has the Fyers mapping been built for today? */
export async function getFyersInstrumentStatus() {
  const last = await kv.get(SYNC_KEY).catch(() => null);
  const { count } = await supabase
    .from("instrument_master")
    .select("id", { count: "exact", head: true })
    .not("fyers_symbol", "is", null);
  return {
    lastSync: last || null,
    mappedContracts: count || 0,
    freshToday: last?.date === istDate(),
  };
}

/** Fire-and-forget sync used when a user switches to Fyers (shared by all users). */
export async function ensureFyersInstruments(force = false) {
  try {
    return await syncFyersInstruments({ force });
  } catch (e: any) {
    console.error("[FYERS_INSTRUMENTS] ensure failed:", e?.message || e);
    return { success: false, error: e?.message || String(e) };
  }
}
