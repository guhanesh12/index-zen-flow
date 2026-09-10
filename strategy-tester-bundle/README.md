# IndexPilotAI — Strategy Tester Bundle

Everything another AI (Claude, ChatGPT, etc.) needs to read, test and improve the
trading strategy. Nothing else from the app is required.

These four files are byte-identical copies of the files running in production
(`supabase/functions/make-server-c4d79cb7/`), so what you test here is what the
live engine trades.

## Files in this bundle (`src/`)

| File | What it is | Why it matters |
|---|---|---|
| `advanced_ai.tsx` | **The signal brain.** Indicators (EMA, VWAP, RSI, ADX, ATR, structure, volume, session profile), confirmation counting, confidence score, and the final `BUY_CALL` / `BUY_PUT` / `WAIT` decision. Entry point: `AdvancedAI.generateSignal(candles, ...)`. | Decides *whether* to trade and *in which direction*. |
| `strategy_rules.ts` | **The single source of truth for trade rules** — entry window, minimum confidence, ADX floor, day-trend / opening-range (sideways) gate, ATR stop, R-multiple target, breakeven, trailing, max hold, daily trade cap, option delta proxy. Also `dayTrendBlockReason()` and `applyTrendDayGate()`. | The live engine and the backtester both import it. Tune numbers **here only**. |
| `strategy_backtest.tsx` | **The backtester.** Downloads real 15-minute candles (Upstox public API), replays `AdvancedAI` bar by bar, applies `strategy_rules`, simulates stop / target / breakeven / trailing / time exits, and builds daily / weekly / monthly / yearly reports. | Run experiments here. `runStrategyBacktest({...})` is the one-shot entry point. |
| `central_market_data.tsx` | **Market data + shared signal store.** How live candles are fetched and how one signal per closed candle is locked in, so retries cannot overwrite a decision. | Context for live vs backtest data flow; not needed to run a backtest. |

Live order placement, broker APIs, wallet, users and UI are deliberately **not**
included — they don't affect the strategy result.

## Current production rules (`strategy_rules.ts`)

- Entry window: 09:45 – 15:00 IST (the 09:15 / 09:30 candles stay blocked)
- Minimum confidence: 85
- Max 1 fresh entry per index per day
- ADX(14) minimum: 20
- Sideways guard: index must be ≥ 0.15% from the day's open in the signal direction
- Opening-range guard: must break the high/low of the first 3 candles of the day
- Stop = 2.5 × ATR(14) · Target = 3R
- Breakeven at 0.3R · Trail from 0.3R at 0.3 × ATR
- Max hold: 20 candles
- Option premium proxy: 0.5 × index move
- Lots: NIFTY 65, BANKNIFTY 30, SENSEX 20 per lot

The live engine applies these same values (entry window, confidence, ADX, daily
cap, ATR stop, R target, breakeven, trailing, time exit); the position monitor
only displays the stop stage the engine has set.

## Known limitation

The backtester uses **index candles with a 0.5× option-premium proxy** — not real
option-chain prices. It ignores spreads, slippage beyond the modelled cost, and
IV crush. Real fills will differ. Any result is a research estimate.

## How to run it

```bash
cd strategy-tester-bundle
deno run -A run.ts            # or: bun run run.ts
FROM=2026-01-01 TO=2026-09-10 CAP=1000000 INDICES=NIFTY,BANKNIFTY deno run -A run.ts
```

Environment variables: `FROM`, `TO` (YYYY-MM-DD), `CAP` (starting capital),
`INDICES` (comma separated). `run.ts` prints trade count, win rate, profit
factor, net P&L, max drawdown and the month-by-month table for whatever window
you pass.

Any proposed rule change must be re-run on both a long window and the most
recent one to two months before it is accepted.
