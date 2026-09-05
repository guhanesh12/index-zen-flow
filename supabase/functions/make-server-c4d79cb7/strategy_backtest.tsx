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
  NIFTY: 65,
  BANKNIFTY: 30,
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
  const CHUNK = 24 * 24 * 60 * 60 * 1000; // API rejects ranges of ~1 month+

  const seen = new Map<number, OHLCCandle>();
  const load = async (a: Date, b: Date, depth = 0): Promise<void> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const candles = await fetchChunk(key, ymd(a), ymd(b));
        for (const cd of candles) if (isFinite(cd.close) && cd.close > 0) seen.set(cd.timestamp, cd);
        return;
      } catch (e) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
        // Last resort: split the range and retry the halves (covers API range caps)
        if (depth < 2 && b.getTime() - a.getTime() > 3 * 86400000) {
          const mid = new Date((a.getTime() + b.getTime()) / 2);
          await load(a, mid, depth + 1);
          await load(new Date(mid.getTime() + 86400000), b, depth + 1);
          return;
        }
        console.error(`[BACKTEST] chunk failed ${index} ${ymd(a)}→${ymd(b)}:`, (e as any)?.message);
      }
    }
  };

  for (let s = start; s <= end; s += CHUNK + 24 * 60 * 60 * 1000) {
    await load(new Date(s), new Date(Math.min(s + CHUNK, end)));
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
// Live engine money rules (per lot): ₹6,000 target / ₹3,000 stop-loss
let TARGET_PER_LOT = 6000;
let SL_PER_LOT = 3000;
export function setRiskParams(targetPerLot: number, slPerLot: number) {
  TARGET_PER_LOT = targetPerLot;
  SL_PER_LOT = slPerLot;
}
const RISK_PER_TRADE = 0.02; // risk 2% of capital per trade
const COST_PER_LOT = 40; // brokerage + taxes + slippage, round trip

interface OpenPos {
  index: IndexName;
  direction: "BUY_CALL" | "BUY_PUT";
  entryTs: number;
  entryPrice: number;
  lots: number;
  qty: number;
  premiumEntry: number;
  confidence: number;
  // live-engine ladder state (all values in ₹ P&L of the whole position)
  baseTarget: number;
  baseSL: number;
  activation: number;
  targetJump: number;
  slJump: number;
  curTarget: number;
  curSL: number; // positive = loss limit, negative = locked profit floor
  peak: number;
  steps: number;
  strategyTargetPrice: number;
  strategyStopPrice: number;
  strategyTrailTriggerPrice: number;
  strategyTrailDistance: number;
  maxHoldBars: number;
  barsHeld: number;
}

export interface ReplayOptions {
  /** Fixed lots per trade for this index (0/undefined → auto risk sizing). */
  fixedLots?: number;
  /** Max entries allowed per trading day for this index (0 → unlimited). */
  maxTradesPerDay?: number;
  /** Ignore signals weaker than this confidence (quality filter). */
  minConfidence?: number;
}

/**
 * Replay the strategy for one index, mirroring the LIVE position monitor:
 * per-lot ₹ target / ₹ stop-loss, ratchet trailing (activation → target/SL
 * jumps → profit lock), AI reversal exits and EOD square-off.
 */
async function replayIndex(
  index: IndexName,
  candles: OHLCCandle[],
  getCapital: () => number,
  onTrade: (t: BTTrade) => void,
  opts: ReplayOptions = {},
) {
  const lotSize = LOT_SIZES[index];
  const maxPerDay = Math.max(0, Math.floor(opts.maxTradesPerDay || 0));
  const minConf = Math.max(0, Number(opts.minConfidence || 0));
  const fixedLots = Math.max(0, Math.floor(opts.fixedLots || 0));
  const entriesByDay = new Map<string, number>();
  let pos: OpenPos | null = null;
  let lastSignalTs = 0;
  let lastDir: "BUY_CALL" | "BUY_PUT" | "WAIT" = "WAIT";


  /** ₹ P&L of the open position if the index trades at `price`. */
  const pnlAt = (p: OpenPos, price: number) =>
    (p.direction === "BUY_CALL" ? price - p.entryPrice : p.entryPrice - price) * DELTA * p.qty;

  /** Index price that produces exactly `pnl` for the open position. */
  const priceFor = (p: OpenPos, pnl: number) => {
    const move = pnl / (DELTA * p.qty);
    return p.direction === "BUY_CALL" ? p.entryPrice + move : p.entryPrice - move;
  };

  const closeAtPnl = (exitTs: number, grossPnl: number, reason: string) => {
    if (!pos) return;
    const p = pos;
    const exitPrice = priceFor(p, grossPnl);
    const premiumExit = Math.max(p.premiumEntry + grossPnl / p.qty, 0.5);
    const costs = COST_PER_LOT * p.lots;
    onTrade({
      index,
      direction: p.direction,
      date: istParts(p.entryTs).date,
      entryTime: `${istParts(p.entryTs).date} ${istParts(p.entryTs).hhmm}`,
      exitTime: `${istParts(exitTs).date} ${istParts(exitTs).hhmm}`,
      entryPrice: Number(p.entryPrice.toFixed(2)),
      exitPrice: Number(exitPrice.toFixed(2)),
      lots: p.lots,
      qty: p.qty,
      premiumEntry: Number(p.premiumEntry.toFixed(2)),
      premiumExit: Number(premiumExit.toFixed(2)),
      pnl: Number((grossPnl - costs).toFixed(2)),
      confidence: p.confidence,
      reason,
    });
    pos = null;
  };

  /** Apply the live ratchet ladder using the running peak profit. */
  const applyTrailing = (p: OpenPos) => {
    if (p.activation > 0 && p.peak >= p.activation) {
      const jumps = Math.floor(p.peak / p.activation);
      if (jumps > p.steps) {
        p.steps = jumps;
        p.curTarget = p.baseTarget + jumps * p.targetJump;
        p.curSL = p.baseSL - jumps * p.slJump;
      }
    }
    // Live profit protection: once the move has banked a full base target of
    // profit, never give the position back to a loss.
    if (p.peak >= p.baseTarget && -p.curSL < p.peak * 0.5) {
      p.curSL = -(p.peak * 0.5);
    }
  };



  for (let i = 60; i < candles.length; i++) {
    const bar = candles[i];
    const info = istParts(bar.timestamp);

    // ---------------------------------------------------- manage open position
    if (pos) {
      const p = pos;
      p.barsHeld += 1;
      const adverse = p.direction === "BUY_CALL" ? bar.low : bar.high;
      const favorable = p.direction === "BUY_CALL" ? bar.high : bar.low;

      // The signal model is trained around its ATR-derived exit levels. Keep
      // the user's per-lot money SL/target as hard limits, but also honor the
      // model exit that made the entry valid. The old replay discarded these
      // levels, requiring (for NIFTY 1 lot) a ~160 point target and turning
      // short momentum trades into all-day holds.
      const strategyStopHit = p.direction === "BUY_CALL"
        ? bar.low <= p.strategyStopPrice
        : bar.high >= p.strategyStopPrice;
      const strategyTargetHit = p.direction === "BUY_CALL"
        ? bar.high >= p.strategyTargetPrice
        : bar.low <= p.strategyTargetPrice;
      const strategyTrailActivated = p.direction === "BUY_CALL"
        ? favorable >= p.strategyTrailTriggerPrice
        : favorable <= p.strategyTrailTriggerPrice;
      if (strategyTrailActivated) {
        const trailPrice = p.direction === "BUY_CALL"
          ? favorable - p.strategyTrailDistance
          : favorable + p.strategyTrailDistance;
        p.strategyStopPrice = p.direction === "BUY_CALL"
          ? Math.max(p.strategyStopPrice, p.entryPrice, trailPrice)
          : Math.min(p.strategyStopPrice, p.entryPrice, trailPrice);
      }

      // 1) conservative: the adverse extreme is tested against the CURRENT stop
      const stopPnl = -p.curSL; // curSL>0 → loss limit; curSL<0 → locked profit
      // OHLC cannot reveal whether target or stop traded first inside a bar.
      // Resolve ties pessimistically (stop first) so reports never overstate
      // win rate or P&L; only book the target when the stop was untouched.
      if (strategyStopHit) {
        closeAtPnl(bar.timestamp, pnlAt(p, p.strategyStopPrice), "STRATEGY_STOP");
      } else if (pnlAt(p, adverse) <= stopPnl) {
        closeAtPnl(bar.timestamp, stopPnl, p.curSL <= 0 ? "TRAIL_LOCK" : "STOPLOSS");
      } else if (strategyTargetHit) {
        closeAtPnl(bar.timestamp, pnlAt(p, p.strategyTargetPrice), "STRATEGY_TARGET");
      } else {

        // 2) ratchet on the favourable extreme, then test the (possibly raised) target
        p.peak = Math.max(p.peak, pnlAt(p, favorable));
        applyTrailing(p);
        if (pnlAt(p, favorable) >= p.curTarget) {
          closeAtPnl(bar.timestamp, p.curTarget, "TARGET");
        } else if (p.barsHeld >= p.maxHoldBars) {
          closeAtPnl(bar.timestamp, pnlAt(p, bar.close), "TIME_EXIT");
        } else if (info.minutes >= 15 * 60 + 15) {
          closeAtPnl(bar.timestamp, pnlAt(p, bar.close), "EOD_EXIT");
        }
      }
    }

    // ---- entries / reversals only inside the intraday window
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

    // ---- quality filter: skip weak signals entirely
    if (minConf > 0 && Number(signal.confidence || 0) < minConf) continue;

    // ---- daily trade budget for this index
    const usedToday = entriesByDay.get(info.date) || 0;
    if (maxPerDay > 0 && usedToday >= maxPerDay && !pos) continue;

    // ---- live reversal rule: flip a LOSING position on a decent counter-signal
    if (pos) {
      const p = pos;
      if (p.direction === signal.action) continue; // same side → hold
      const livePnl = pnlAt(p, bar.close);
      const conf = Number(signal.confidence || 0);
      const canReverse = livePnl < 0 ? (conf >= 68 && Math.abs(livePnl) >= p.baseSL * 0.45) : conf >= 90 && livePnl <= p.baseSL * 0.7;
      if (!canReverse) continue;
      closeAtPnl(bar.timestamp, livePnl, "AI_REVERSAL");
      if (maxPerDay > 0 && (entriesByDay.get(info.date) || 0) >= maxPerDay) {
        lastSignalTs = bar.timestamp;
        lastDir = signal.action;
        continue; // budget spent — reversal only closes, never re-enters
      }
    }

    lastSignalTs = bar.timestamp;
    lastDir = signal.action;

    const next = candles[i + 1];
    if (!next) break;

    const entry = next.open;
    const premium = premiumOf(entry);
    const capital = getCapital();
    const perLot = premium * lotSize;
    const byRisk = Math.floor((capital * RISK_PER_TRADE) / (SL_PER_LOT + COST_PER_LOT));
    const byMargin = Math.floor((capital * 0.35) / perLot);
    const lots = fixedLots > 0
      ? Math.max(1, Math.min(fixedLots, Math.max(1, byMargin)))
      : Math.max(0, Math.min(20, byRisk, byMargin));
    if (lots < 1) continue;
    entriesByDay.set(info.date, (entriesByDay.get(info.date) || 0) + 1);


    const baseTarget = TARGET_PER_LOT * lots;
    const baseSL = SL_PER_LOT * lots;
    // live defaults when the user has not customised the ladder
    const activation = Math.round(TARGET_PER_LOT * 0.5) * lots;
    const slJump = Math.round(SL_PER_LOT * 0.5) * lots;
    const targetJump = Math.round(TARGET_PER_LOT * 0.33) * lots;
    const suggestedTarget = Number(signal.riskManagement?.suggestedTarget);
    const suggestedStop = Number(signal.riskManagement?.suggestedStopLoss);
    const suggestedTrailTrigger = Number(signal.riskManagement?.trailingStop?.trigger);
    const suggestedTrailDistance = Number(signal.riskManagement?.trailingStop?.trailDistance);
    const signalReference = Number(signal.riskManagement?.suggestedEntry) || bar.close;
    const targetDistance = Number.isFinite(suggestedTarget)
      ? Math.max(1, Math.abs(suggestedTarget - signalReference))
      : Math.max(1, atr14(window) * 0.4);
    const modelStopDistance = Number.isFinite(suggestedStop)
      ? Math.abs(signalReference - suggestedStop)
      : atr14(window) * 2;
    // The broad structural stop is useful as a last-resort live money guard,
    // but a backtested 15m momentum entry must invalidate quickly when it does
    // not follow through. Cap the strategy stop near its target distance while
    // retaining the user's larger per-lot emergency stop underneath.
    const stopDistance = Math.max(1, Math.min(modelStopDistance, targetDistance * 0.9));

    pos = {
      index,
      direction: signal.action,
      entryTs: next.timestamp,
      entryPrice: entry,
      lots,
      qty: lots * lotSize,
      premiumEntry: premium,
      confidence: Math.round(signal.confidence || 0),
      baseTarget,
      baseSL,
      activation,
      targetJump,
      slJump,
      curTarget: baseTarget,
      curSL: baseSL,
      peak: 0,
      steps: 0,
      strategyTargetPrice: signal.action === "BUY_CALL" ? entry + targetDistance : entry - targetDistance,
      strategyStopPrice: signal.action === "BUY_CALL" ? entry - stopDistance : entry + stopDistance,
      strategyTrailTriggerPrice: Number.isFinite(suggestedTrailTrigger)
        ? entry + (suggestedTrailTrigger - signalReference)
        : signal.action === "BUY_CALL" ? entry + stopDistance * 0.8 : entry - stopDistance * 0.8,
      strategyTrailDistance: Number.isFinite(suggestedTrailDistance)
        ? Math.max(1, suggestedTrailDistance)
        : Math.max(1, atr14(window) * 0.6),
      maxHoldBars: Math.max(1, Number(signal.riskManagement?.maxHoldBars) || 8),
      barsHeld: 0,
    };
    i++; // entry consumed the next bar's open; management starts after it
  }

  if (pos) {
    const last = candles[candles.length - 1];
    closeAtPnl(last.timestamp, pnlAt(pos, last.close), "OPEN_AT_END");
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

/**
 * Replay ONE index over ONE date slice. Used by the segmented (low-CPU) run
 * flow so a long backtest never exceeds the edge-function CPU budget.
 * A lead-in window before `fromDate` is fetched for indicator warm-up; trades
 * entered before `fromDate` are discarded.
 */
export async function replaySegment(params: {
  index: IndexName;
  fromDate: string;
  toDate: string;
  capital: number;
  lots?: number;
  maxTradesPerDay?: number;
  minConfidence?: number;
}): Promise<BTTrade[]> {
  const leadIn = new Date(new Date(`${params.fromDate}T00:00:00Z`).getTime() - 20 * 86400000);
  const candles = await fetchHistoricalCandles(params.index, ymd(leadIn), params.toDate);
  if (candles.length < 80) return [];
  const out: BTTrade[] = [];
  await replayIndex(
    params.index,
    candles,
    () => Math.max(params.capital, 10000),
    (t) => { if (t.date >= params.fromDate) out.push(t); },
    {
      fixedLots: params.lots,
      maxTradesPerDay: params.maxTradesPerDay,
      minConfidence: params.minConfidence,
    },
  );
  return out;
}


/** Build the full report from an already-computed trade list. */
export function buildReport(
  trades: BTTrade[],
  params: { strategy?: string; indices: IndexName[]; initialCapital: number; fromDate: string; toDate: string },
): BacktestResult {
  const indices = params.indices;
  const initialCapital = Math.max(10000, params.initialCapital || 100000);
  trades = trades.slice().sort((a, b) => (a.entryTime < b.entryTime ? -1 : 1));
  let capital = initialCapital;


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

/** Full run in one shot (used by internal/admin tooling and short ranges). */
export async function runStrategyBacktest(params: {
  strategy?: string;
  indices?: IndexName[];
  initialCapital: number;
  fromDate: string;
  toDate: string;
}): Promise<BacktestResult> {
  const indices = (params.indices?.length ? params.indices : (["NIFTY", "BANKNIFTY", "SENSEX"] as IndexName[]));
  const initialCapital = Math.max(10000, params.initialCapital || 100000);
  const trades: BTTrade[] = [];
  for (const idx of indices) {
    const t = await replaySegment({
      index: idx,
      fromDate: params.fromDate,
      toDate: params.toDate,
      capital: initialCapital / indices.length,
    });
    trades.push(...t);
  }
  return buildReport(trades, { ...params, indices, initialCapital });
}
