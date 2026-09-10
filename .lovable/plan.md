# Stop the sideways-day losses and make the monitor protect profit

## What happened today

The morning NIFTY PUT was taken on a day that was not trending. Price went 40 points
against the trade, the stop was hit for about ₹9,400, and then the market reversed the
way the signal had predicted. Two things caused this:

1. The sideways filter is too weak. It only asks that the index be 0.15% away from the
   day's open. At 09:45 that is almost always true, so choppy days still get a trade.
2. The stop is a fixed 1.5 x ATR from entry with no "wait for the move to prove itself"
   step. On a whipsaw open that stop is exactly where the noise lives.

An honest note first: no strategy is profitable every week and every month. Anyone
promising that is guessing. What I can do is make the system take far fewer, much
better trades, and cut the losing months down — and prove it on 5 years of data instead
of a few days.

## Plan

### 1. Only trade when the day is actually trending
- Raise the trend requirement and measure it properly: the index must be beyond the
  opening range (first 2 candles' high/low) in the signal's direction, not just 0.15%
  from the open.
- Require the 1-hour trend and the 15-minute trend to agree.
- Add a "choppy day" lockout: if the first trade of the day on an index is stopped out,
  no further entry on that index that day.
- If the day does not qualify, the screen shows **WAIT — sideways day**, and no signal
  card is issued at all. Right now a signal appears and is then silently blocked; that
  is the confusing part the user saw.

### 2. Give the trade room, then protect it
- Entry only on a pullback/retest inside the signal candle instead of chasing the close.
- Wider initial stop (structure-based: below the last swing low / above swing high,
  capped by ATR), so ordinary noise cannot hit it.
- Hard per-trade rupee cap so the wider stop never costs more than today's ₹9,400.
- Move to breakeven earlier, then trail — protecting profit is the priority over
  squeezing the last rupee.

### 3. Test on 5 years, not 5 days
- Build a repeatable harness over 5 years of 15-minute data for NIFTY, BANKNIFTY,
  SENSEX using the same signal engine the live system runs (not a separate simulator).
- Grid-search the new rules, then report per-month and per-week results, win rate,
  profit factor, worst drawdown, and the count of losing months.
- Ship only a configuration that is profitable across all four windows (1M / 3M / 6M /
  1Y) *and* on the 5-year out-of-sample split. If nothing passes, report that honestly
  rather than shipping a curve-fit.

### 4. Position monitor upgrade
Rebuild the monitor card so hold-vs-exit is obvious at a glance:
- Entry, live price, quantity, live P&L (1s refresh, already in place).
- Distance to stop and to target in both rupees and points, with a bar.
- Current stop level and whether it is the original, breakeven, or trailing stop.
- Peak profit, give-back from peak, time held, bars held vs the 8-bar limit.
- A plain-English verdict line: HOLD / WATCH / EXIT and why.
- One-tap Exit with confirmation, and an Exit-half button.

### 5. Explain every blocked signal
Every skipped entry gets a one-line reason on screen: sideways day, confidence below
threshold, ADX too low, daily cap reached, no matching contract. No more silent skips.

## Technical notes

- Shared rules stay in `supabase/functions/make-server-c4d79cb7/strategy_rules.ts` so
  the backtester and the live engine can never diverge again.
- Sideways/opening-range gate and the stopped-out lockout go into the signal producer
  (`advanced_ai.tsx` / `central_market_data.tsx`) so a blocked day produces **WAIT**
  rather than a signal that the engine later refuses.
- Entry/stop/trail changes land in `persistent_engine.tsx` and mirror into
  `strategy_backtest.tsx` through the shared rules.
- Monitor UI work is in `src/app/components/AdvancedPositionMonitor.tsx` and the
  terminal position panel; the extra fields come from `raw_position`.
- Backtest harness runs off real 15-minute data pulled for 5 years, cached locally, and
  driven through the live signal function.

## Order of work

1. Build the 5-year harness and reproduce today's loss in it (proves the harness is real).
2. Search the new rule set; report results before touching production.
3. Apply the winning configuration to the shared rules and the live engine.
4. Ship the monitor and the skip-reason UI.
