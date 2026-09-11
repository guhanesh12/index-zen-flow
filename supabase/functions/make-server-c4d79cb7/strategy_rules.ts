/**
 * 📐 SINGLE SOURCE OF TRUTH FOR THE TRADED STRATEGY RULES
 *
 * Both the Strategy Backtester (strategy_backtest.tsx) and the live trading
 * engine (persistent_engine.tsx) import these values, so the numbers shown in
 * the backtest report always describe the strategy that actually runs in
 * production. Never hard-code these rules anywhere else.
 */
export const STRATEGY_RULES = {
  /** Fresh entries are only allowed inside this IST window (minutes of day). */
  entryStartMinutesIst: 9 * 60 + 30, // 09:30 — the 09:15 opening bar stays blocked
  entryEndMinutesIst: 15 * 60, // 15:00 cutoff — the last 30 minutes are blocked
  /** Signals weaker than this are ignored for fresh entries. */
  minConfidence: 85,
  /** Max fresh entries per index per trading day. */
  maxTradesPerIndexPerDay: 1,
  /** Minimum ADX(14) — below this the market is ranging, so we stand aside. */
  minAdx: 20,
  /**
   * ADX measures strength, not direction. When ADX sits just under `minAdx`
   * but +DI/-DI clearly point the same way as the signal, the move is
   * directional, not sideways — allow it down to this floor.
   */
  minAdxWithDi: 18,
  /** Required +DI/-DI gap (in DI points) for the relaxed ADX path. */
  minDiSpread: 6,
  /**
   * Sideways-day guard: the index must already be this far (in %) from the
   * day's open, in the signal's direction, before a fresh entry is allowed.
   */
  dayTrendPct: 0.15,
  /**
   * Opening-range guard: the index must trade beyond the high/low of the first
   * N candles of the day, in the signal's direction. 0 disables the guard.
   * Validated over 4.7 years of 15m data (2022-02 → 2026-09).
   */
  openingRangeBars: 0,
  /** Initial stop = ATR(14) x this multiple, target = stop x rrTarget. */
  stopAtrMult: 2.5,
  rrTarget: 3.0,
  /** Partial booking is DISABLED — the live engine exits in one piece. */
  partialAtR: 0,
  /** Move the stop to entry once the trade is this far in profit (in R). */
  beAtR: 0.3,
  /** Start trailing from this profit level (in R), at trailAtrMult x ATR. */
  trailAtR: 0.3,
  trailAtrMult: 0.3,
  /** Option premium moves roughly this fraction of the index move. */
  optionDelta: 0.5,
  /** Hard time exit after this many candles. */
  maxHoldBars: 20,
} as const;


/** Average True Range over the last `period` candles. */
export function atrOf(
  candles: { high: number; low: number; close: number }[],
  period = 14,
): number {
  if (!candles || candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = Math.max(1, candles.length - period); i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    trs.push(
      Math.max(
        c.high - c.low,
        Math.abs(c.high - prev.close),
        Math.abs(c.low - prev.close),
      ),
    );
  }
  if (!trs.length) return 0;
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

/** IST calendar date (YYYY-MM-DD) of a candle timestamp (seconds or ms). */
export function istDateOf(ts: number): string {
  const ms = ts > 1e12 ? ts : ts * 1000;
  return new Date(ms + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Trending-day guard. Returns "" when the day qualifies for a fresh entry, or
 * a plain-English reason when it does not (sideways day / inside the opening
 * range). `endIndex` is the index of the signal candle inside `candles`.
 */
export function dayTrendBlockReason(
  candles: { open: number; high: number; low: number; close: number; timestamp: number }[],
  endIndex: number,
  action: string,
): string {
  const bar = candles[endIndex];
  if (!bar) return "";
  const date = istDateOf(bar.timestamp);
  let j = endIndex;
  while (j > 0 && istDateOf(candles[j - 1].timestamp) === date) j--;
  const dayOpen = candles[j].open;
  if (!dayOpen) return "";

  if (STRATEGY_RULES.dayTrendPct > 0) {
    const movePct = ((bar.close - dayOpen) / dayOpen) * 100;
    const ok = action === "BUY_CALL"
      ? movePct >= STRATEGY_RULES.dayTrendPct
      : movePct <= -STRATEGY_RULES.dayTrendPct;
    if (!ok) {
      const wanted = action === "BUY_CALL" ? "up" : "down";
      const against = action === "BUY_CALL" ? movePct < 0 : movePct > 0;
      return against
        ? `Day is moving against the signal — index is ${movePct.toFixed(2)}% from the open, the signal needs a ${wanted} day of at least ${STRATEGY_RULES.dayTrendPct}%`
        : `Sideways day — index is only ${movePct.toFixed(2)}% from the open (needs ${STRATEGY_RULES.dayTrendPct}% ${wanted} before entry)`;
    }
  }

  const orBars = STRATEGY_RULES.openingRangeBars;
  if (orBars > 0) {
    const last = Math.min(j + orBars - 1, endIndex);
    if (endIndex <= last) return "Opening range not complete yet";
    let hi = -Infinity;
    let lo = Infinity;
    for (let k = j; k <= last; k++) {
      hi = Math.max(hi, candles[k].high);
      lo = Math.min(lo, candles[k].low);
    }
    const broke = action === "BUY_CALL" ? bar.close > hi : bar.close < lo;
    if (!broke) {
      return `Sideways day — price is still inside the opening range (${lo.toFixed(0)}–${hi.toFixed(0)})`;
    }
  }
  return "";
}

/** Backwards-compatible boolean form of {@link dayTrendBlockReason}. */
export function dayTrendOk(
  candles: any[],
  endIndex: number,
  action: string,
): boolean {
  return dayTrendBlockReason(candles, endIndex, action) === "";
}

/**
 * Turns an executable signal into a WAIT when the day does not qualify, so the
 * UI never shows a BUY card that the engine will silently refuse to trade.
 */
export function applyTrendDayGate(sig: any, candles: any[]): any {
  if (!sig || (sig.action !== "BUY_CALL" && sig.action !== "BUY_PUT")) return sig;
  if (!Array.isArray(candles) || candles.length < 2) return sig;
  const why = dayTrendBlockReason(candles, candles.length - 1, sig.action);
  if (!why) return sig;
  sig.blockedAction = sig.action;
  sig.blockedReason = why;
  sig.action = "WAIT";
  sig.reason = `WAIT: ${why}`;
  return sig;
}

/**
 * Converts a fresh-entry signal to WAIT before it reaches the UI when the live
 * engine would reject it for confidence, ADX, or the per-user daily entry cap.
 */
export function applyExecutionEntryGates(
  sig: any,
  context: { hasOpenPosition: boolean; dailyEntriesUsed: number },
): any {
  if (!sig || (sig.action !== "BUY_CALL" && sig.action !== "BUY_PUT")) return sig;
  if (context.hasOpenPosition) return sig;

  const confidence = Number(sig.confidence || 0);
  const adx = Number(sig.indicators?.adx || 0);
  let why = "";
  if (confidence < STRATEGY_RULES.minConfidence) {
    why = `Signal confidence ${confidence}% is below the ${STRATEGY_RULES.minConfidence}% entry minimum`;
  } else if (STRATEGY_RULES.minAdx > 0 && adx < STRATEGY_RULES.minAdx) {
    why = `Sideways market — ADX ${adx.toFixed(1)} is below ${STRATEGY_RULES.minAdx}`;
  } else if (context.dailyEntriesUsed >= STRATEGY_RULES.maxTradesPerIndexPerDay) {
    why = `Daily entry limit reached (${STRATEGY_RULES.maxTradesPerIndexPerDay} per index)`;
  }
  if (!why) return sig;

  sig.blockedAction = sig.action;
  sig.blockedReason = why;
  sig.action = "WAIT";
  sig.reason = `WAIT: ${why}`;
  return sig;
}

