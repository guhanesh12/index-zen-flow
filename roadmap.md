# Roadmap

- [x] Diagnose and fix blocked/delayed live CALL and PUT signals
- [x] Block one-candle counter-trend CALL/PUT traps across NIFTY, BANKNIFTY, and SENSEX on 5m/15m
- [x] Diagnose and fix user backtest results/model mismatch
- [x] Add focused regression tests and verify edge function behavior
- [x] Audit every 15-minute entry path and remove low-quality/repeated signals
- [x] Add realistic trade lifecycle, stop/target, and non-overlapping backtest rules
- [x] Replay 60 days across NIFTY, BANKNIFTY, and SENSEX and compare win rate/drawdown
- [x] Deploy the validated strategy update
- [x] Make partial exits use complete lots and block half-exits for single-lot positions
- [x] Lock backtests to the live one-trade-per-index daily rule
- [x] Convert non-executable confidence, ADX, and daily-cap signals to WAIT before display
- [x] Add a compact working Partial Exit on/off control to Position Monitor
- [x] Restore visible Top Movers, Technicals, and Live News data
