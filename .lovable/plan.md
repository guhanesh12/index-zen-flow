## Why no PUT signal fired between 12:00 and 13:45 today

Confirmed from `trading_signals` + `trading_engine_state`:

- Engine was **running the entire day** (heartbeat alive until 15:31 IST). Not a VPS issue.
- No Dhan `TOKEN_EXPIRED` rows hit between 12:00–13:45. Not a token issue.
- NIFTY price path: 24073 (10:45) → 24062 (11:45) → **23958 (13:45)** — a ~115 pt slow grind down over ~2 hours.
- Strategy returned `WAIT` for every 15m close in that window (12:15, 12:30, 12:45, 13:00, 13:15, 13:30). Only one weak `BUY_PUT @ 59%` fired at 12:00 (below 70% auto-execute threshold), then nothing until a 95% PUT at 13:45 — too late, the move was already done.

**Root cause:** the breakdown detector I added earlier requires three things to happen on the SAME candle:
1. `close < previous candle low` (break prior bar low)
2. close in lower 35% of the candle's range
3. price below VWAP by ≥ 0.15%

In a slow drift-down (today's pattern), individual 15m candles zigzag — each bar rarely takes out the previous bar's low *and* closes weak. So the detector stayed silent for 90 minutes while the index lost 100+ points. The "main" bearish path requires ADX ≥ 20 + EMA9<EMA21 cross + high volume simultaneously, which a slow grind also fails.

## Fix Plan (single file: `supabase/functions/make-server-c4d79cb7/advanced_ai.tsx`)

### 1. Add a "Slow Drift" PUT detector (mirror for CALL)
After the strict breakdown block, if action is still `WAIT`, evaluate a softer drift trigger that doesn't need a single dramatic candle:

Trigger BUY_PUT when **all** of these hold on the closed 15m bar:
- Last 3 closes are each lower than the close 3 bars ago (sustained lower closes), **OR** last 4 of 5 bars closed red.
- Current close is below VWAP by ≥ 0.20%, AND VWAP slope over last 5 bars is negative.
- EMA9 < EMA21 (no cross required, just current state) AND EMA21 slope ≤ 0.
- RSI(14) between 35 and 55 and falling (current < prior).
- ADX ≥ 15 (lower than the 20 used elsewhere — drifts don't show strong ADX).

Confidence: base **72**, +4 if 4-of-5 red bars, +4 if RSI < 45, +4 if H1/HTF alignment = bear, +3 if volume ≥ 1.1× avg. Cap 88. Reason string: `📉 DRIFT BUY_PUT — N lower closes, VWAP-X.XX%, EMA stack bear, RSI YY falling.` Symmetric `DRIFT BUY_CALL` for upside drift.

### 2. Auto-execute threshold tweak for confirmed drift only
In `persistent_engine.tsx` order placement gate (where the 70/80 threshold currently lives — same gate that skipped the 59% BUY_PUT at 12:00), allow execution at **≥ 65%** *only* when the signal's `reasoning` starts with `📉 DRIFT` or `📈 DRIFT` (i.e., drift detector fired). All other signals keep their current threshold. This prevents the 59% noise signals from sneaking through while letting the new, evidence-based drift signals trade.

### 3. Persist explanation for every cycle (debuggability)
Currently `saveSignalToDb` early-returns when action is `WAIT`, so we have no record of *why* the engine stayed silent at 12:15, 12:30, etc. Change it to write a lightweight row (signal_type `WAIT`) with a short `raw_data.skip_reason` (e.g. `"drift conditions not met: VWAP+0.05%, RSI 52 not falling"`) only at the end of each 15m bucket per index (max 4 WAIT rows per hour per index, so we don't flood the table). Next time the user asks "why no trade at 12:30?" we can answer from one SQL query.

### 4. No changes elsewhere
- Exhaustion guard, breakout detector, position monitor, SL/TGT, broker code, UI panels — untouched.
- No DB migration (uses existing `raw_data` jsonb).

## Expected behavior on today's tape (replay)

With the drift detector, candles around 12:15–12:45 would have produced:
- 3 lower closes ✓, VWAP slope down ✓, EMA9<EMA21 ✓, RSI falling through 50 ✓ → **BUY_PUT 72–80%** → executed at 65% threshold for DRIFT signals → caught the bulk of the 100+ pt drop.

## Out of scope

- Token / VPS UI banners (already added, user confirmed both are fine today).
- Any change to morning CALL logic, position monitor exits, or option contract resolution.
