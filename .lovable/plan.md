# Make live signals reliably place the intended order

## Finding
- The 10:29:58 BANKNIFTY reading was a pre-close preview. The final closed 10:30 candle became `WAIT`, so it correctly did not place an order.
- SENSEX closed at 78%, below the production 85% minimum.
- NIFTY closed at 88%, but both accounts had already used today’s one-NIFTY-trade allowance. The engine therefore did not place another NIFTY order.
- At 11:00, both accounts successfully placed a real NIFTY PUT order, confirming the broker execution path works.
- A real reliability issue remains: concurrent candle publishers can calculate and overwrite different decisions for one candle.

## Changes
1. Make the first valid closed-candle signal an atomic, immutable decision shared by every engine user.
2. Prevent the retry publisher or a user fallback from replacing that candle’s decision.
3. Keep the 85% confidence requirement and one-trade-per-index daily cap unchanged.
4. Improve skip records so disabled slots, daily limits, and non-final/pre-close readings are distinguishable from broker failures.
5. Deploy the engine and verify the next tick, stored signal, and order/skip records.

## Safety
No order will be placed retroactively. Existing positions and today’s completed orders remain untouched.
