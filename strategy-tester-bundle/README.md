# IndexPilotAI — Strategy Tester Bundle

Everything another AI (Claude, ChatGPT, etc.) needs to read, test and improve the
trading strategy. Nothing else from the app is required.

## Files in this bundle (`src/`)

| File | Lines | What it is | Why it matters |
|---|---|---|---|
| `advanced_ai.tsx` | 4221 | **The strategy brain.** Indicators (EMA, VWAP, RSI, ADX, ATR, structure, volume, session profile), confirmation counting, confidence score, and the final `BUY_CALL` / `BUY_PUT` / `WAIT` decision. Entry point: `AdvancedAI.generateSignal(candles, ...)`. | This is what decides *whether* to trade and *in which direction*. |
| `strategy_rules.ts` | 149 | **The single source of truth for trade rules** — entry window, minimum confidence, ADX floor, day-trend / opening-range (sideways) gate, ATR stop, R-multiple target, breakeven, trailing, max hold, daily trade cap, lot proxy delta. Also `dayTrendBlockReason()` and `applyTrendDayGate()`. | Both the live engine and the backtester import this, so the tested strategy = the traded strategy. Tune numbers **here only**. |
| `strategy_backtest.tsx` | 753 | **The backtester.** Downloads real 15-minute candles (Upstox public API), replays `AdvancedAI` bar by bar, applies `strategy_rules`, simulates stop/target/breakeven/trailing/time exits, and builds daily/weekly/monthly/yearly reports. | Run experiments here. `runStrategyBacktest({...})` is the one-shot entry point. |
| `central_market_data.tsx` | 234 | **Market data + shared signal store.** How live candles are fetched and how one signal per closed candle is locked in (so retries can't overwrite a decision). | Needed to understand live vs backtest data flow; not required to run a backtest. |

Live order placement, broker APIs, wallet, users and UI are deliberately **not**
included — they don't affect the strategy result.

## Current production rules (from `strategy_rules.ts`)

- Entry window: 09:45 – 15:00 IST (09:15 / 09:30 candles blocked)
- Minimum confidence: 85
- Max 1 fresh entry per index per day
- ADX(14) minimum: 20
- Sideways guard: index must be ≥ 0.15% from the day's open in the signal direction
- Opening-range guard: must break the high/low of the first 2 candles of the day
- Stop = 1.5 × ATR(14) · Target = 4R · Breakeven at 0.5R · Trail from 1R at 0.6 × ATR
- Max hold: 8 candles (2 hours)
- Option premium proxy: 0.5 × index move
- Lots: NIFTY 65, BANKNIFTY 30, SENSEX 20 per lot

## Known limitation to tell the other AI

The backtester uses **index candles with a 0.5× option-premium proxy** — not real
option-chain prices. It ignores spreads, slippage beyond the modelled cost, and
IV crush. Real fills will differ. Any result is a research estimate.

## How to run it

```bash
cd strategy-tester-bundle
deno run -A run.ts            # or: bun run run.ts
FROM=2026-01-01 TO=2026-09-10 CAP=1000000 deno run -A run.ts
```

`run.ts` prints trades, win rate, profit factor, net P&L, max drawdown and the
month-by-month table.

## Latest measured results (real 15m data, ₹10,00,000, 3 indices)

- 1 Aug – 10 Sep 2026: 34 trades, 44% win, PF 1.03, **+₹1,124**
- 4.7-year run (2022-02 → 2026-09): PF 1.21, **+₹4,22,432**, max drawdown ₹1,14,765, 21 losing months out of 56

Use these as the baseline any proposed change must beat — on **both** the long
window and the recent 1–2 month window.
