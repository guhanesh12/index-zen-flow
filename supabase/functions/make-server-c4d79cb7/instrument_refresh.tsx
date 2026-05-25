// @ts-nocheck
// Centralized daily instrument master refresh for NIFTY / BANKNIFTY / SENSEX option contracts.
// Downloads Dhan scrip master ONCE per day, filters to index options, bulk-upserts into public.instrument_master.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const DHAN_SCRIP_CSV = "https://images.dhan.co/api-data/api-scrip-master.csv";
const TARGET_UNDERLYINGS = new Set(["NIFTY", "BANKNIFTY", "SENSEX"]);

interface InstrumentRow {
  symbol: string;
  security_id: string;
  index_name: string;
  strike_price: number;
  option_type: "CE" | "PE";
  expiry_date: string; // YYYY-MM-DD
  lot_size: number;
  exchange_segment: string;
  tick_size: number;
}

// Robust CSV row parser (handles quoted fields)
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
  return out.map(s => s.trim());
}

function toDateOnly(raw: string): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function refreshInstrumentMaster(opts: { force?: boolean } = {}) {
  const startTs = Date.now();

  // Trading-day gate (skip weekends/holidays unless forced)
  if (!opts.force) {
    const { data: isTradingDay } = await supabase.rpc("is_trading_day");
    if (isTradingDay === false) {
      return { success: true, skipped: true, reason: "Not a trading day" };
    }
  }

  console.log("[INSTRUMENT_REFRESH] Downloading Dhan scrip master CSV...");
  const res = await fetch(DHAN_SCRIP_CSV);
  if (!res.ok) {
    throw new Error(`Dhan CSV download failed: ${res.status}`);
  }
  const text = await res.text();
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) throw new Error("CSV empty");

  const header = parseCsvRow(lines[0]);
  const idx = (name: string) => header.findIndex(h => h.toUpperCase() === name.toUpperCase());

  // Common Dhan master columns
  const cExchSeg = idx("SEM_EXM_EXCH_ID") >= 0 ? idx("SEM_EXM_EXCH_ID") : idx("EXCH_ID");
  const cSegment = idx("SEM_SEGMENT");
  const cSecId = idx("SEM_SMST_SECURITY_ID");
  const cInstr = idx("SEM_INSTRUMENT_NAME");
  const cSymbol = idx("SEM_TRADING_SYMBOL");
  const cStrike = idx("SEM_STRIKE_PRICE");
  const cOptType = idx("SEM_OPTION_TYPE");
  const cExpiry = idx("SEM_EXPIRY_DATE");
  const cLot = idx("SEM_LOT_UNITS");
  const cTick = idx("SEM_TICK_SIZE");
  const cUnderlying = idx("SM_SYMBOL_NAME") >= 0 ? idx("SM_SYMBOL_NAME") : idx("SEM_CUSTOM_SYMBOL");

  if (cSecId < 0 || cSymbol < 0 || cStrike < 0 || cOptType < 0 || cExpiry < 0) {
    throw new Error("Required CSV columns missing");
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rows: InstrumentRow[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length < 10) continue;
    const cols = parseCsvRow(line);

    const instr = (cols[cInstr] || "").toUpperCase();
    if (!instr.includes("OPT")) continue; // only options

    const optType = (cols[cOptType] || "").toUpperCase();
    if (optType !== "CE" && optType !== "PE") continue;

    const tradingSym = (cols[cSymbol] || "").toUpperCase();
    // Reject look-alike underlyings (NIFTYNXT50, FINNIFTY, MIDCPNIFTY, BANKEX, SENSEX50 etc.)
    let indexName = "";
    if (tradingSym.startsWith("BANKNIFTY") && !/^BANKNIFTY[A-Z]/.test(tradingSym.replace("BANKNIFTY", "X"))) {
      indexName = "BANKNIFTY";
    } else if (/^NIFTY\d/.test(tradingSym) || /^NIFTY\s/.test(tradingSym) || tradingSym === "NIFTY") {
      // True NIFTY contracts: "NIFTY" followed by a digit (expiry/strike) — excludes NIFTYNXT50, NIFTYIT, FINNIFTY, MIDCPNIFTY
      indexName = "NIFTY";
    } else if (/^SENSEX\d/.test(tradingSym) || tradingSym === "SENSEX") {
      // True SENSEX (excludes SENSEX50, BANKEX)
      indexName = "SENSEX";
    } else continue;

    if (!TARGET_UNDERLYINGS.has(indexName)) continue;

    const expiry = toDateOnly(cols[cExpiry]);
    if (!expiry) continue;
    const expDate = new Date(expiry);
    if (expDate < today) continue; // skip expired

    const strike = Number(cols[cStrike]);
    if (!isFinite(strike) || strike <= 0) continue;

    const secId = (cols[cSecId] || "").trim();
    if (!secId) continue;

    const lotSize = Math.max(1, parseInt(cols[cLot] || "0", 10) || (
      indexName === "NIFTY" ? 75 : indexName === "BANKNIFTY" ? 30 : 20
    ));
    const tick = Number(cols[cTick]) || 0.05;
    const segRaw = (cols[cSegment] || "").toUpperCase();
    const exchRaw = (cols[cExchSeg] || "").toUpperCase();
    let exchSeg = "NSE_FNO";
    if (indexName === "SENSEX" || exchRaw === "BSE" || segRaw.includes("BSE")) exchSeg = "BSE_FNO";

    const dedup = `${indexName}|${expiry}|${optType}|${strike}`;
    if (seen.has(dedup)) continue;
    seen.add(dedup);

    rows.push({
      symbol: tradingSym,
      security_id: secId,
      index_name: indexName,
      strike_price: strike,
      option_type: optType as "CE" | "PE",
      expiry_date: expiry,
      lot_size: lotSize,
      exchange_segment: exchSeg,
      tick_size: tick,
    });
  }

  // Keep only nearest 2 expiries per index to stay lean
  const byIndex: Record<string, Set<string>> = {};
  for (const r of rows) {
    (byIndex[r.index_name] ||= new Set()).add(r.expiry_date);
  }
  const keepExpiries: Record<string, Set<string>> = {};
  for (const [idxName, exps] of Object.entries(byIndex)) {
    const sorted = [...exps].sort();
    keepExpiries[idxName] = new Set(sorted.slice(0, 2));
  }
  const filtered = rows.filter(r => keepExpiries[r.index_name].has(r.expiry_date));

  console.log(`[INSTRUMENT_REFRESH] Parsed ${rows.length} options, keeping ${filtered.length} nearest-expiry.`);

  // Truncate + bulk insert (chunked)
  await supabase.from("instrument_master").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < filtered.length; i += CHUNK) {
    const batch = filtered.slice(i, i + CHUNK);
    const { error } = await supabase.from("instrument_master").insert(batch);
    if (error) {
      console.error("[INSTRUMENT_REFRESH] Insert error:", error.message);
      throw error;
    }
    inserted += batch.length;
  }

  const ms = Date.now() - startTs;
  console.log(`[INSTRUMENT_REFRESH] ✅ Done in ${ms}ms — inserted ${inserted} contracts`);
  return {
    success: true,
    inserted,
    indices: Object.fromEntries(
      Object.entries(keepExpiries).map(([k, v]) => [k, [...v]]),
    ),
    duration_ms: ms,
  };
}

// ============================================
// AUTO SYMBOL RESOLVER (used at signal time)
// ============================================

export type Moneyness = "ATM" | "ITM1" | "ITM2" | "OTM1" | "OTM2";

const STRIKE_GAP: Record<string, number> = {
  NIFTY: 50,
  BANKNIFTY: 100,
  SENSEX: 100,
};

export interface ResolvedSymbol {
  symbol: string;
  security_id: string;
  exchange_segment: string;
  strike_price: number;
  expiry_date: string;
  lot_size: number;
  option_type: "CE" | "PE";
  index_name: string;
}

/**
 * Compute target strike for given index LTP + moneyness + option type, then
 * fetch the matching row from instrument_master.
 */
export async function resolveAutoSymbol(params: {
  index_name: "NIFTY" | "BANKNIFTY" | "SENSEX";
  ltp: number;
  option_type: "CE" | "PE";
  moneyness: Moneyness;
}): Promise<ResolvedSymbol | null> {
  const { index_name, ltp, option_type, moneyness } = params;
  const gap = STRIKE_GAP[index_name] || 50;
  const atm = Math.round(ltp / gap) * gap;

  // For CE: ITM = lower strike, OTM = higher strike
  // For PE: ITM = higher strike, OTM = lower strike
  let offset = 0;
  if (moneyness === "ITM1") offset = -1;
  else if (moneyness === "ITM2") offset = -2;
  else if (moneyness === "OTM1") offset = 1;
  else if (moneyness === "OTM2") offset = 2;
  if (option_type === "PE") offset = -offset;

  const target = atm + offset * gap;

  // Nearest expiry that has the target strike
  const { data, error } = await supabase
    .from("instrument_master")
    .select("symbol, security_id, exchange_segment, strike_price, expiry_date, lot_size, option_type, index_name")
    .eq("index_name", index_name)
    .eq("option_type", option_type)
    .eq("strike_price", target)
    .order("expiry_date", { ascending: true })
    .limit(1);

  if (error) {
    console.error("[AUTO_SYMBOL] lookup error:", error.message);
    return null;
  }
  if (!data || data.length === 0) {
    // Fallback: try the next nearest available strike
    const { data: near } = await supabase
      .from("instrument_master")
      .select("symbol, security_id, exchange_segment, strike_price, expiry_date, lot_size, option_type, index_name")
      .eq("index_name", index_name)
      .eq("option_type", option_type)
      .order("expiry_date", { ascending: true })
      .limit(200);
    if (!near || near.length === 0) return null;
    // pick closest strike on the earliest expiry
    const earliest = near[0].expiry_date;
    const sameExp = near.filter(r => r.expiry_date === earliest);
    sameExp.sort((a, b) => Math.abs(a.strike_price - target) - Math.abs(b.strike_price - target));
    return sameExp[0] as ResolvedSymbol;
  }
  return data[0] as ResolvedSymbol;
}
