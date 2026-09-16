# Make Advanced Position Monitor truly market-driven

## Goal
Make each active position refresh from the connected broker every second and clearly explain whether the market is favorable, needs watching, or requires an exit. Preserve capital-protection rules without promising guaranteed profit.

## Changes
- Validate each one-second cycle before showing it as fresh; surface stale or failed market updates instead of silently displaying old values.
- Keep live option price, P&L, target, stop-loss, peak profit, and trailing stop updated from the broker snapshot every second.
- Strengthen the decision result using the traded index’s real closed-candle technicals: EMA direction, VWAP side, RSI, MACD, volume/order flow, signal direction, confidence, and confirmation count.
- Persist the exact market direction, signal, confidence, technical confirmation score, decision reason, and data timestamp with every position update.
- Show those details on the Advanced Position Monitor so `FAVORABLE`, `WATCH`, and `EXIT` always include a specific market-based reason.
- Keep hard target, stop-loss, profit-lock, trailing-stop, day-end, and confirmed-reversal exits server-side. Never exit from browser calculations.
- Verify the monitor endpoint, active-position display, one-second timestamps, and exit-order path without changing entry strategy rules.

## Safety rules
- Do not claim or imply guaranteed profit or capital protection.
- Do not exit solely because P&L changed; P&L remains only a hard target/stop/trailing input.
- Require a confirmed opposite market signal for predictive reversal exits, while hard risk exits remain immediate.
- If fresh technical data is unavailable, show `WATCH — market data unavailable` and rely only on hard broker-based risk controls.

## Technical details
- Update `persistent_engine.tsx` decision metadata and ordering so the stored row contains the final decision and reason.
- Update `AdvancedPositionMonitor.tsx` polling health and decision-detail presentation.
- Deploy `make-server-c4d79cb7`, inspect function logs, and run a focused browser check.
