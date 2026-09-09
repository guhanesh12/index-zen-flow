// @ts-nocheck
/**
 * 🟡 5PAISA SCRIP MASTER SYNC
 *
 * Docs: https://xstream.5paisa.com/dev-docs/docFundamentals/scrip-master
 *
 * 5paisa publishes the daily scrip master as public CSV (no auth):
 *   https://Openapi.5paisa.com/VendorsAPI/Service1.svc/ScripMaster/segment/nse_fo
 *   https://Openapi.5paisa.com/VendorsAPI/Service1.svc/ScripMaster/segment/bse_fo
 *
 * Columns (parsed BY NAME, order is not guaranteed):
 *   Exch,ExchType,ScripCode,ScripData,Name,Expiry,ScripType,StrikeRate,ISIN,
 *   LotSize,FullName,QtyLimit,TickSize,Multiplier,BOCOAllowed,SymbolRoot,Series
 *
 * We keep ONLY NIFTY / BANKNIFTY / SENSEX options for the NEAREST 2 expiries and
 * merge them into the SAME `instrument_master` table every other broker uses, so
 * one contract row carries each broker's own symbol/token.
 *
 * 🔁 ONE DOWNLOAD FOR ALL USERS: cached in KV per IST date, streamed line-by-line
 *    (the dumps are several MB — never buffer + split the whole file at once).
 */

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import * as kv from "./kv_store.tsx";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const BASE = "https://Openapi.5paisa.com/VendorsAPI/Service1.svc/ScripMaster/segment";
const DUMPS = [
  { url: `${BASE}/nse_fo`, exch: "N", segment: "NSE_FNO" },
  { url: `${BASE}/bse_fo`, exch: "B", segment: "BSE_FNO" },
];
const TARGET_UNDERLYINGS = new Set(["NIFTY", "BANKNIFTY", "SENSEX"]);
const SYNC_KEY = "fivepaisa_instruments:last_sync";

function istDate(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === "," && !quoted) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** 5paisa expiry appears as "/Date(ms+0530)/", an epoch, or an ISO/date string. */
function parseExpiry(raw: string): string {
  const v = String(raw || "").trim();
  if (!v) return "";
  const wrapped = /\/Date\((-?\d+)/.exec(v);
  if (wrapped) return new Date(Number(wrapped[1])).toISOString().slice(0, 10);
  if (/^\d{13}$/.test(v)) return new Date(Number(v)).toISOString().slice(0, 10);
  if (/^\d{10}$/.test(v)) return new Date(Number(v) * 1000).toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** Build the ScripData symbol 5paisa expects when ScripData is absent from the dump. */
function buildScripData(name: string, expiry: string, optionType: string, strike: number): string {
  const compact = expiry.replace(/-/g, "");
  const strikeStr = Number.isInteger(strike) ? String(strike) : String(strike);
  return `${name}_${compact}_${optionType}_${strikeStr}`;
}

/** Stream one CSV dump, emitting only near-term index option rows. */
async function downloadDump(d: { url: string; exch: string; segment: string }, today: string): Promise<any[]> {
  const res = await fetch(d.url);
  if (!res.ok || !res.body) throw new Error(`5paisa scrip master failed (${d.exch}): ${res.status}`);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const rows: any[] = [];
  let buffer = "";
  let header: string[] | null = null;
  let idx: Record<string, number> = {};

  const handleLine = (line: string) => {
    if (!line) return;
    const cells = splitCsvLine(line);
    if (!header) {
      header = cells.map((c) => c.trim());
      idx = {};
      header.forEach((h, i) => { idx[h.trim().toLowerCase().replace(/\s+/g, "")] = i; });
      return;
    }
    const get = (name: string) => (idx[name] != null ? String(cells[idx[name]] ?? "").trim() : "");

    const optionType = get("scriptype").toUpperCase();
    if (optionType !== "CE" && optionType !== "PE") return;

    const root = (get("symbolroot") || get("name")).toUpperCase().replace(/[^A-Z]/g, "");
    const underlying = [...TARGET_UNDERLYINGS].find((u) => root === u);
    if (!underlying) return;

    const expiry = parseExpiry(get("expiry"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || expiry < today) return;

    const strike = Number(get("strikerate"));
    if (!isFinite(strike) || strike <= 0) return;

    const scripCode = get("scripcode");
    if (!scripCode) return;

    const name = get("name");
    const scripData = get("scripdata") || buildScripData(name, expiry, optionType, strike);

    const lot = parseInt(get("lotsize"), 10);
    const tick = Number(get("ticksize"));

    rows.push({
      index_name: underlying,
      expiry_date: expiry,
      strike_price: strike,
      option_type: optionType,
      fivepaisa_scrip_code: scripCode,
      fivepaisa_scrip_data: scripData,
      fivepaisa_exchange: d.exch,
      lot_size: Math.max(1, lot || 1),
      tick_size: isFinite(tick) && tick > 0 ? tick : 0.05,
      exchange_segment: d.segment,
    });
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    let nl = buffer.indexOf("\n");
    while (nl >= 0) {
      handleLine(buffer.slice(0, nl).replace(/\r$/, ""));
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf("\n");
    }
  }
  handleLine(buffer.replace(/\r$/, ""));

  return rows;
}

async function downloadFivepaisaContracts(): Promise<any[]> {
  const today = istDate();
  const out: any[] = [];
  for (const d of DUMPS) {
    try {
      const rows = await downloadDump(d, today);
      console.log(`[FIVEPAISA_INSTRUMENTS] ${d.exch}: ${rows.length} index option rows`);
      out.push(...rows);
    } catch (e: any) {
      console.error("[FIVEPAISA_INSTRUMENTS]", e?.message || e);
    }
  }
  return out;
}

/**
 * Download + merge 5paisa contracts for NIFTY / BANKNIFTY / SENSEX
 * (nearest `expiries` expiries per index) into instrument_master.
 */
export async function syncFivepaisaInstruments(opts: { force?: boolean; expiries?: number } = {}) {
  const startTs = Date.now();
  const keepCount = Math.max(1, opts.expiries ?? 2);
  const today = istDate();

  if (!opts.force) {
    const last = await kv.get(SYNC_KEY).catch(() => null);
    if (last?.date === today && Number(last?.count) > 0) {
      return { success: true, skipped: true, reason: "Already synced today", ...last };
    }
  }

  await kv.set(`${SYNC_KEY}:running`, { at: new Date().toISOString() }).catch(() => {});
  console.log("[FIVEPAISA_INSTRUMENTS] Downloading scrip masters...");
  const all = await downloadFivepaisaContracts();
  if (all.length === 0) {
    await kv.del(`${SYNC_KEY}:running`).catch(() => {});
    throw new Error("5paisa scrip master download returned no option contracts");
  }

  const byIndex: Record<string, Set<string>> = {};
  for (const r of all) (byIndex[r.index_name] ||= new Set()).add(r.expiry_date);
  const keep: Record<string, Set<string>> = {};
  for (const [i, exps] of Object.entries(byIndex)) {
    keep[i] = new Set([...exps].sort().slice(0, keepCount));
  }

  const seen = new Set<string>();
  const filtered = all.filter((r) => {
    if (!keep[r.index_name]?.has(r.expiry_date)) return false;
    const k = `${r.index_name}|${r.expiry_date}|${r.option_type}|${r.strike_price}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  console.log(`[FIVEPAISA_INSTRUMENTS] Merging ${filtered.length} near-expiry contracts...`);

  let updated = 0;
  let inserted = 0;
  const CHUNK = 500;
  for (let i = 0; i < filtered.length; i += CHUNK) {
    const batch = filtered.slice(i, i + CHUNK);
    const { data, error } = await supabase.rpc("apply_fivepaisa_instruments", { _rows: batch });
    if (error) {
      console.error("[FIVEPAISA_INSTRUMENTS] merge error:", error.message);
      await kv.del(`${SYNC_KEY}:running`).catch(() => {});
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
  await kv.del(`${SYNC_KEY}:running`).catch(() => {});
  console.log(`[FIVEPAISA_INSTRUMENTS] ✅ ${filtered.length} contracts (updated ${updated}, inserted ${inserted}) in ${result.duration_ms}ms`);
  return result;
}

/** Has the 5paisa mapping been built for today? */
export async function getFivepaisaInstrumentStatus() {
  const [last, running, err] = await Promise.all([
    kv.get(SYNC_KEY).catch(() => null),
    kv.get(`${SYNC_KEY}:running`).catch(() => null),
    kv.get(`${SYNC_KEY}:error`).catch(() => null),
  ]);
  const { count } = await supabase
    .from("instrument_master")
    .select("id", { count: "exact", head: true })
    .not("fivepaisa_scrip_code", "is", null);
  return {
    lastSync: last || null,
    mappedContracts: count || 0,
    freshToday: last?.date === istDate(),
    syncing: !!running,
    syncError: err?.error || null,
    expiries: last?.expiries || null,
  };
}

/**
 * Fire-and-forget sync used when a user switches to / connects 5paisa.
 * NEVER await this from the login path — see docs/BROKER_INTEGRATION_PLAYBOOK.md.
 */
export async function ensureFivepaisaInstruments(force = false) {
  try {
    const res = await syncFivepaisaInstruments({ force });
    await kv.del(`${SYNC_KEY}:error`).catch(() => {});
    return res;
  } catch (e: any) {
    const error = e?.message || String(e);
    console.error("[FIVEPAISA_INSTRUMENTS] ensure failed:", error);
    await kv.set(`${SYNC_KEY}:error`, { error, at: new Date().toISOString() }).catch(() => {});
    await kv.del(`${SYNC_KEY}:running`).catch(() => {});
    return { success: false, error };
  }
}
