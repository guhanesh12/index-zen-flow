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
  entryStartMinutesIst: 9 * 60 + 45, // 09:45
  entryEndMinutesIst: 13 * 60 + 30, // 13:30
  /** Signals weaker than this are ignored for fresh entries. */
  minConfidence: 85,
  /** Max fresh entries per index per trading day. */
  maxTradesPerIndexPerDay: 1,
  /** Minimum ADX(14) — below this the market is ranging, so we stand aside. */
  minAdx: 20,
  /**
   * Sideways-day guard: the index must already be this far (in %) from the
   * day's open, in the signal's direction, before a fresh entry is allowed.
   */
  dayTrendPct: 0.15,
  /** Initial stop = ATR(14) x this multiple, target = stop x rrTarget. */
  stopAtrMult: 1.5,
  rrTarget: 2.0,
  /** Partial booking is DISABLED — the live engine exits in one piece. */
  partialAtR: 0,
  /** Move the stop to entry once the trade is this far in profit (in R). */
  beAtR: 0.5,
  /** Start trailing from this profit level (in R), at trailAtrMult x ATR. */
  trailAtR: 1.0,
  trailAtrMult: 0.6,
  /** Option premium moves roughly this fraction of the index move. */
  optionDelta: 0.5,
  /** Hard time exit after this many candles. */
  maxHoldBars: 8,
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
 * Sideways-day guard. Returns true when the index has already moved
 * STRATEGY_RULES.dayTrendPct in the signal's direction since the day's open.
 * `endIndex` is the index of the signal candle inside `candles`.
 */
export function dayTrendOk(
  candles: { open: number; close: number; timestamp: number }[],
  endIndex: number,
  action: string,
): boolean {
  if (STRATEGY_RULES.dayTrendPct <= 0) return true;
  const bar = candles[endIndex];
  if (!bar) return true;
  const date = istDateOf(bar.timestamp);
  let j = endIndex;
  while (j > 0 && istDateOf(candles[j - 1].timestamp) === date) j--;
  const dayOpen = candles[j].open;
  if (!dayOpen) return true;
  const movePct = ((bar.close - dayOpen) / dayOpen) * 100;
  return action === "BUY_CALL"
    ? movePct >= STRATEGY_RULES.dayTrendPct
    : movePct <= -STRATEGY_RULES.dayTrendPct;
}
