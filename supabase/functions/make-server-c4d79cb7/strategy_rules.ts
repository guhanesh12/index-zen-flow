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
  minConfidence: 75,
  /** Max fresh entries per index per trading day. */
  maxTradesPerIndexPerDay: 2,
  /** Initial stop = ATR(14) x this multiple, target = stop x rrTarget. */
  stopAtrMult: 1.5,
  rrTarget: 2.5,
  /** Partial booking is DISABLED — the live engine exits in one piece. */
  partialAtR: 0,
  /** Move the stop to entry once the trade is this far in profit (in R). */
  beAtR: 0.8,
  /** Start trailing from this profit level (in R), at trailAtrMult x ATR. */
  trailAtR: 1.5,
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
