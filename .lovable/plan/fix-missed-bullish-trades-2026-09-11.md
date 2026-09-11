# Fix missed bullish trades

## What will change
- Make the strategy use +DI/-DI as the direction source when a fresh move conflicts with lagging EMAs.
- Replace conflicting internal ADX thresholds with the shared production rule: ADX 20+, or ADX 18–20 only with a six-point DI spread supporting the signal.
- Make the hourly trend a quality input rather than a hidden hard rejection when the current 15-minute move is directionally confirmed.
- Remove duplicate live-engine gate checks so signals, displayed reasons, backtests, and order execution use one decision path.
- Correct the opening-time rejection message so a blocked 09:15 candle is not described as a post-15:00 rejection.
- Keep the production and strategy-tester copies synchronized.

## Verification
- Add regression coverage for a bullish 15-minute move against lagging bearish EMAs.
- Verify sideways and wrong-direction DI cases still remain WAIT.
- Run the strategy tests, confirm the web build, deploy the trading function, and inspect the deployed health/log signal.

## Important boundary
A green candle alone will not force an order. Confidence, trend direction, daily limit, enabled NIFTY slot, connected broker, and valid contract must still pass. Broker acceptance and fills cannot be guaranteed.

## Technical details
Today's records show zero broker order attempts. At 10:00 and 10:15 the model produced PUT candidates, but the day-direction gate correctly blocked them because the index was flat or rising. At 11:15 the bullish reversal was rejected as `TRENDING_DOWN` because lagging trend inputs overruled the fresh move. The current engines are running and Dhan is connected; both users only have a NIFTY auto-slot, so BANKNIFTY and SENSEX cannot place orders until those slots exist.
