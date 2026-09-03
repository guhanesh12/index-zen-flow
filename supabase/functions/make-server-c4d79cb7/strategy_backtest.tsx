/**
 * 📊 INDEXPILOTAI STRATEGY BACKTEST ENGINE
 *
 * Replays the LIVE IndexPilotAI strategy (advanced_ai.tsx) over real historical
 * 15-minute index candles (NIFTY / BANKNIFTY / SENSEX) and produces a full
 * performance report: daily / weekly / monthly / yearly P&L, win-rate,
 * profit days vs loss days, equity curve and per-index breakdown.
 *
 * Data source: public historical candle API (same OHLC the central market data
 * section uses for live signals) — no user broker token required.
 */

import { AdvancedAI, type OHLCCandle } from "./advanced_ai.tsx";

export type IndexName = "NIFTY" | "BANKNIFTY" | "SENSEX";

const INSTRUMENT_KEYS: Record<IndexName, string> = {
  NIFTY: "NSE_INDEX|Nifty 50",
  BANKNIFTY: "NSE_INDEX|Nifty Bank",
  SENSEX: "BSE_INDEX|SENSEX",
};

export const LOT_SIZES: Record<IndexName, number> = {
  NIFTY: 75,
  BANKNIFTY: 35,
  SENSEX: 20,
};

export const BACKTEST_COST = 5; // ₹ per run, debited from the user wallet

// ---------------------------------------------------------------- data fetch

function ymd(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

async function fetchChunk(instrumentKey: string, from: string, to: string): Promise<OHLCCandle[]> {
  const url =
    `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(instrumentKey)}` +
    `/minutes/15/${to}/${from}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Candle API ${res.status} for ${instrumentKey}`);
  const json = await res.json();
  const rows: any[] = json?.data?.candles || [];
  return rows.map((r) => ({
    timestamp: new Date(r[0]).getTime(),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]) || 0,
  }));
}

/** Historical 15m candles for a date range (chunked — the API caps each call). */
export async function fetchHistoricalCandles(
  index: IndexName,
  fromDate: string,
  toDate: string,
): Promise<OHLCCandle[]> {
  const key = INSTRUMENT_KEYS[index];
  const start = new Date(`${fromDate}T00:00:00Z`).getTime();
  const end = new Date(`${toDate}T00:00:00Z`).getTime();
  const CHUNK = 30 * 24 * 60 * 60 * 1000;

  const seen = new Map<number, OHLCCandle>();
  for (let s = start; s <= end; s += CHUNK + 24 * 60 * 60 * 1000) {
    const cFrom = new Date(s);
    const cTo = new Date(Math.min(s + CHUNK, end));
    try {
      const candles = await fetchChunk(key, ymd(cFrom), ymd(cTo));
      for (const cd of candles) if (isFinite(cd.close) && cd.close > 0) seen.set(cd.timestamp, cd);
    } catch (e) {
      console.error(`[BACKTEST] chunk failed ${index} ${ymd(cFrom)}→${ymd(cTo)}:`, (e as any)?.message);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.timestamp - b.timestamp);
}

// ---------------------------------------------------------------- simulation

export interface BTTrade {
  index: IndexName;
  direction: "BUY_CALL" | "BUY_PUT";
  date: string; // IST YYYY-MM-DD
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  lots: number;
  qty: number;
  premiumEntry: number;
  premiumExit: number;
  pnl: number;
  confidence: number;
  reason: string;
}

function istParts(ts: number) {
  const d = new Date(ts + 5.5 * 3600 * 1000);
  return {
    date: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
      d.getUTCDate(),
    ).padStart(2, "0")}`,
    hhmm: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

function atr14(candles: OHLCCandle[]): number {
  const n = Math.min(15, candles.length);
  if (n < 2) return 0;
  const slice = candles.slice(-n);
  let sum = 0;
  for (let i = 1; i < slice.length; i++) {
    const p = slice[i - 1], c = slice[i];
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  return sum / (slice.length - 1);
}

/** ATM option premium proxy (~0.5 delta option on the index). */
function premiumOf(indexPrice: number) {
  return Math.max(indexPrice * 0.0055, 40);
}

const DELTA = 0.5;
const SL_ATR = 2.5;
const TGT_ATR = 0.4;
const COST_PER_LOT = 40; // brokerage + taxes + slippage, round trip

interface OpenPos {
  index: IndexName;
  direction: "BUY_CALL" | "BUY_PUT";
  entryTs: number;
  entryPrice: number;
  sl: number;
  target: number;
  lots: number;
  qty: number;
  premiumEntry: number;
  confidence: number;
}

/**
 * Replay the strategy for one index. Returns the closed trades.
 * `capitalFor(ts)` supplies the live capital so lot sizing compounds.
 */
async function replayIndex(
  index: IndexName,
  candles: OHLCCandle[],
  getCapital: () => number,
  onTrade: (t: BTTrade) => void,
) {
  const lotSize = LOT_SIZES[index];
  let pos: OpenPos | null = null;
  let lastSignalTs = 0;
  let lastDir: "BUY_CALL" | "BUY_PUT" | "WAIT" = "WAIT";

  const closePos = (exitTs: number, exitPrice: number, reason: string) => {
    if (!pos) return;
    const move = pos.direction === "BUY_CALL" ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice;
    const premiumExit = Math.max(pos.premiumEntry + move * DELTA, 0.5);
    const gross = (premiumExit - pos.premiumEntry) * pos.qty;
    const costs = COST_PER_LOT * pos.lots;
    const t: BTTrade = {
      index,
      direction: pos.direction,
      date: istParts(pos.entryTs).date,
      entryTime: `${istParts(pos.entryTs).date} ${istParts(pos.entryTs).hhmm}`,
      exitTime: `${istParts(exitTs).date} ${istParts(exitTs).hhmm}`,
      entryPrice: Number(pos.entryPrice.toFixed(2)),
      exitPrice: Number(exitPrice.toFixed(2)),
      lots: pos.lots,
      qty: pos.qty,
      premiumEntry: Number(pos.premiumEntry.toFixed(2)),
      premiumExit: Number(premiumExit.toFixed(2)),
      pnl: Number((gross - costs).toFixed(2)),
      confidence: pos.confidence,
      reason,
    };
    onTrade(t);
    pos = null;
  };

  for (let i = 60; i < candles.length; i++) {
    const bar = candles[i];
    const info = istParts(bar.timestamp);

    // ---- manage an open position first (intrabar SL / target, then EOD)
    if (pos) {
      const hitSL = pos.direction === "BUY_CALL" ? bar.low <= pos.sl : bar.high >= pos.sl;
      const hitTgt = pos.direction === "BUY_CALL" ? bar.high >= pos.target : bar.low <= pos.target;
      if (hitTgt) closePos(bar.timestamp, pos!.target, "TARGET");
      else if (hitSL) closePos(bar.timestamp, pos!.sl, "STOPLOSS");
      else if (info.minutes >= 15 * 60) closePos(bar.timestamp, bar.close, "EOD_EXIT");
      if (pos) continue; // still open → no new entry
    }

    // ---- entries only inside the intraday window
    if (info.minutes < 9 * 60 + 30 || info.minutes > 14 * 60 + 45) continue;

    const window = candles.slice(Math.max(0, i - 149), i + 1);
    let signal: any;
    try {
      signal = AdvancedAI.generateAdvancedSignal(window, getCapital(), {
        timeframeMinutes: 15,
        enforceClosedCandle: false,
        lastSignalTimestamp: lastSignalTs || undefined,
        lastSignalDirection: lastDir,
      });
    } catch (_e) {
      continue;
    }
    if (!signal || (signal.action !== "BUY_CALL" && signal.action !== "BUY_PUT")) continue;

    lastSignalTs = bar.timestamp;
    lastDir = signal.action;

    const next = candles[i + 1];
    if (!next) break;

    const entry = next.open;
    const a = Math.max(atr14(window), entry * 0.0008);
    const premium = premiumOf(entry);
    const capital = getCapital();
    const perLot = premium * lotSize;
    const lots = Math.max(0, Math.min(10, Math.floor((capital * 0.9) / perLot)));
    if (lots < 1) continue;

    pos = {
      index,
      direction: signal.action,
      entryTs: next.timestamp,
      entryPrice: entry,
      sl: signal.action === "BUY_CALL" ? entry - SL_ATR * a : entry + SL_ATR * a,
      target: signal.action === "BUY_CALL" ? entry + TGT_ATR * a : entry - TGT_ATR * a,
      lots,
      qty: lots * lotSize,
      premiumEntry: premium,
      confidence: Math.round(signal.confidence || 0),
    };
    i++; // entry consumed the next bar's open; management starts after it
  }

  if (pos) {
    const last = candles[candles.length - 1];
    closePos(last.timestamp, last.close, "OPEN_AT_END");
  }
}

// ---------------------------------------------------------------- reporting

function weekKey(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return ymd(d);
}

export interface BacktestResult {
  strategy: string;
  indices: IndexName[];
  fromDate: string;
  toDate: string;
  initialCapital: number;
  finalCapital: number;
  summary: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    netPnL: number;
    roi: number;
    profitFactor: number;
    maxDrawdown: number;
    avgWin: number;
    avgLoss: number;
    bestTrade: number;
    worstTrade: number;
    tradingDays: number;
    profitDays: number;
    lossDays: number;
    flatDays: number;
    dayWinRate: number;
    avgDaily: number;
    avgWeekly: number;
    avgMonthly: number;
    projectedYearly: number;
  };
  daily: { period: string; pnl: number; trades: number }[];
  weekly: { period: string; pnl: number; trades: number }[];
  monthly: { period: string; pnl: number; trades: number }[];
  yearly: { period: string; pnl: number; trades: number }[];
  byIndex: { index: IndexName; trades: number; wins: number; winRate: number; pnl: number }[];
  equityCurve: { date: string; equity: number }[];
  trades: BTTrade[];
}

export async function runStrategyBacktest(params: {
  strategy?: string;
  indices?: IndexName[];
  initialCapital: number;
  fromDate: string;
  toDate: string;
}): Promise<BacktestResult> {
  const indices = (params.indices?.length ? params.indices : (["NIFTY", "BANKNIFTY", "SENSEX"] as IndexName[]));
  const initialCapital = Math.max(10000, params.initialCapital || 100000);

  let capital = initialCapital;
  const trades: BTTrade[] = [];

  for (const idx of indices) {
    const candles = await fetchHistoricalCandles(idx, params.fromDate, params.toDate);
    if (candles.length < 80) continue;
    await replayIndex(idx, candles, () => Math.max(capital / indices.length, 10000), (t) => {
      trades.push(t);
    });
  }

  trades.sort((a, b) => (a.entryTime < b.entryTime ? -1 : 1));

  // running equity (all indices share the same wallet)
  let equity = initialCapital;
  const equityCurve: { date: string; equity: number }[] = [];
  const dayMap = new Map<string, { pnl: number; trades: number }>();
  for (const t of trades) {
    equity += t.pnl;
    const d = dayMap.get(t.date) || { pnl: 0, trades: 0 };
    d.pnl += t.pnl;
    d.trades += 1;
    dayMap.set(t.date, d);
  }
  capital = equity;

  const daily = Array.from(dayMap.entries())
    .map(([period, v]) => ({ period, pnl: Number(v.pnl.toFixed(2)), trades: v.trades }))
    .sort((a, b) => (a.period < b.period ? -1 : 1));

  let run = initialCapital;
  for (const d of daily) {
    run += d.pnl;
    equityCurve.push({ date: d.period, equity: Number(run.toFixed(2)) });
  }

  const bucket = (keyOf: (d: string) => string) => {
    const m = new Map<string, { pnl: number; trades: number }>();
    for (const d of daily) {
      const k = keyOf(d.period);
      const cur = m.get(k) || { pnl: 0, trades: 0 };
      cur.pnl += d.pnl;
      cur.trades += d.trades;
      m.set(k, cur);
    }
    return Array.from(m.entries())
      .map(([period, v]) => ({ period, pnl: Number(v.pnl.toFixed(2)), trades: v.trades }))
      .sort((a, b) => (a.period < b.period ? -1 : 1));
  };

  const weekly = bucket(weekKey);
  const monthly = bucket((d) => d.slice(0, 7));
  const yearly = bucket((d) => d.slice(0, 4));

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const netPnL = grossWin - grossLoss;

  let peak = initialCapital;
  let maxDD = 0;
  for (const p of equityCurve) {
    peak = Math.max(peak, p.equity);
    maxDD = Math.max(maxDD, peak - p.equity);
  }

  const profitDays = daily.filter((d) => d.pnl > 0).length;
  const lossDays = daily.filter((d) => d.pnl < 0).length;
  const flatDays = daily.filter((d) => d.pnl === 0).length;
  const days = daily.length || 1;
  const avgDaily = netPnL / days;

  const byIndex = indices.map((idx) => {
    const list = trades.filter((t) => t.index === idx);
    const w = list.filter((t) => t.pnl > 0).length;
    return {
      index: idx,
      trades: list.length,
      wins: w,
      winRate: list.length ? Number(((w / list.length) * 100).toFixed(1)) : 0,
      pnl: Number(list.reduce((s, t) => s + t.pnl, 0).toFixed(2)),
    };
  });

  return {
    strategy: params.strategy || "indexpilotai",
    indices,
    fromDate: params.fromDate,
    toDate: params.toDate,
    initialCapital,
    finalCapital: Number(capital.toFixed(2)),
    summary: {
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: trades.length ? Number(((wins.length / trades.length) * 100).toFixed(1)) : 0,
      netPnL: Number(netPnL.toFixed(2)),
      roi: Number(((netPnL / initialCapital) * 100).toFixed(2)),
      profitFactor: grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? 99 : 0,
      maxDrawdown: Number(maxDD.toFixed(2)),
      avgWin: wins.length ? Number((grossWin / wins.length).toFixed(2)) : 0,
      avgLoss: losses.length ? Number((grossLoss / losses.length).toFixed(2)) : 0,
      bestTrade: trades.length ? Number(Math.max(...trades.map((t) => t.pnl)).toFixed(2)) : 0,
      worstTrade: trades.length ? Number(Math.min(...trades.map((t) => t.pnl)).toFixed(2)) : 0,
      tradingDays: daily.length,
      profitDays,
      lossDays,
      flatDays,
      dayWinRate: daily.length ? Number(((profitDays / daily.length) * 100).toFixed(1)) : 0,
      avgDaily: Number(avgDaily.toFixed(2)),
      avgWeekly: Number((avgDaily * 5).toFixed(2)),
      avgMonthly: Number((avgDaily * 21).toFixed(2)),
      projectedYearly: Number((avgDaily * 250).toFixed(2)),
    },
    daily,
    weekly,
    monthly,
    yearly,
    byIndex,
    equityCurve,
    trades: trades.slice(-500),
  };
}
