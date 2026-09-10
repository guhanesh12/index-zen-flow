# Make the backtester and the live engine trade the same rules

The finding is real. Today the Strategy Backtester and the live trading engine follow two different rulebooks, so the profit, accuracy and monthly numbers shown in the backtester are not what the engine would actually produce.

## What differs today

| Rule | Backtester | Live engine |
| --- | --- | --- |
| Entry window | 09:45 – 13:30 only | until 15:15 |
| Minimum confidence | 75% | none |
| Max entries per index per day | 2 | none |
| Stop | 1.5 x ATR of the last 14 candles | fixed rupees per lot from the signal |
| Target | 2.5 x that stop | fixed rupees per lot |
| Book half the position at 1R | yes | no |
| Move stop to entry at 0.8R | yes | no |
| Start trailing at 1.5R | yes | rupee-step ratchet instead |
| Size when capital allows zero lots | still buys 1 lot | trade is skipped |

## Approach

Bring the live engine up to the backtester's rules (that is the version that was tuned and validated), and fix the one sizing bug in the backtester.

1. **Single source of truth for the rules.** Add one shared settings module under `supabase/functions/make-server-c4d79cb7/` holding the entry window (09:45–13:30), minimum confidence 75, max 2 entries per index per day, stop 1.5xATR14, target 2.5R, partial book at 1R, breakeven at 0.8R, trail from 1.5R. Both the backtester and the live engine import it, so they can never drift again.

2. **Live entry gating** in `persistent_engine.tsx`: replace the two `blockNewEntriesAfterMinutes: 15:15` call sites with the shared window, and refuse a new entry when confidence is below the shared minimum or the index already has 2 entries that day (counted in the existing key-value store, reset per trading date).

3. **Live exit ladder** in `persistent_engine.tsx`: compute the stop from 1.5xATR14 and the target at 2.5R at entry time, store them on the position, then on each monitor tick — book half the quantity at 1R (once), move the stop to entry at 0.8R (once), and trail from 1.5R. The existing rupee-per-lot ratchet is removed for positions opened under the new ladder; positions already open keep their current handling so nothing in flight breaks.

4. **Backtester sizing fix** in `strategy_backtest.tsx`: restore the real skip — compute lots without the `Math.max(1, ...)` floors and skip the trade when it comes out below 1, so reported P&L no longer counts trades the account could not afford.

5. **Verify** by running the backtester over 1M/3M/6M/1Y after the change and confirming the trade count and P&L still line up with what the engine's rules now permit.

## Risk note

Step 3 touches live order handling and partial exits, which means real orders. It will be done so that positions opened before the change keep their existing exit behaviour, and partial booking places a genuine partial-quantity exit through the same broker path already used for full exits.
