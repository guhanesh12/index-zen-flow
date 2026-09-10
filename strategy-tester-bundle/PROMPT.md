# Prompt — paste this into Claude / ChatGPT with the bundle attached

---

You are a quantitative trading engineer. I am attaching 4 TypeScript files from
my live intraday options system (Indian market: NIFTY, BANKNIFTY, SENSEX,
15-minute candles, weekly options, one lot = NIFTY 65 / BANKNIFTY 30 / SENSEX 20).

**Files and their roles**

1. `advanced_ai.tsx` — the signal brain. `AdvancedAI.generateSignal()` computes
   EMA/VWAP/RSI/ADX/ATR/market-structure/volume/session confirmations and returns
   `BUY_CALL` / `BUY_PUT` / `WAIT` with a 0–100 confidence.
2. `strategy_rules.ts` — the single source of truth for trade rules. The live
   engine AND the backtester both import it, so changing a number here changes
   both. Current values:
   entry 09:45–15:00 IST · min confidence 85 · max 1 entry per index per day ·
   ADX ≥ 20 · day-trend guard 0.15% from day open · opening-range guard 2 candles ·
   stop 1.5 × ATR(14) · target 4R · breakeven 0.5R · trail from 1R at 0.6 × ATR ·
   max hold 8 candles · option premium proxy 0.5 × index move.
3. `strategy_backtest.tsx` — the backtester. Downloads real 15m candles from the
   Upstox public historical API, replays the brain bar by bar, applies the rules,
   simulates stop / target / breakeven / trailing / time exits, and reports
   daily / weekly / monthly / yearly P&L, win rate, profit factor, equity curve.
   Entry point: `runStrategyBacktest({ indices, initialCapital, fromDate, toDate })`.
4. `central_market_data.tsx` — how live candles are fetched and how exactly one
   signal per closed candle is locked in. Context only.

**Important limitation:** the backtest prices options as `0.5 × index move`, not
from a real option chain. No IV crush, no real spread. Treat every number as an
estimate, and say so in your conclusions.

**Baseline I must beat** (₹10,00,000 capital, all three indices):
- 1 Aug – 10 Sep 2026: 34 trades, 44% win, PF 1.03, +₹1,124
- 2022-02 → 2026-09: PF 1.21, +₹4,22,432, max drawdown ₹1,14,765, 21 losing months of 56

**What I want you to do**

1. Read `advanced_ai.tsx` and `strategy_rules.ts` carefully and describe, in plain
   language, exactly what conditions produce a trade today.
2. Find real weaknesses: look-ahead bias, indicators computed on the forming
   candle, double counting of confirmations, exit logic that books the favourable
   side of a bar first, entries that the live engine could never actually take.
3. Propose concrete rule changes (numbers in `strategy_rules.ts`, or logic in the
   brain) that raise profit factor and cut max drawdown.
4. For every proposal, state which window it helps and which it hurts. A change
   is only acceptable if it improves the 4.7-year run **and** does not turn the
   most recent 1–2 months negative. Reject anything that only works in-sample.
5. Give me a ranked list: change, expected effect, risk of overfitting, and the
   exact diff.

**Rules for your answer**

- No guarantees of "no loss" or "80–90% win rate" — tell me honestly what is
  achievable. A realistic intraday system wins 40–55% with a profit factor above 1.2.
- Prefer fewer, higher-quality trades over more trades.
- Do not change lot sizes, index list, or the 15-minute timeframe.
- Keep `strategy_rules.ts` as the only place where tunable numbers live.

---
