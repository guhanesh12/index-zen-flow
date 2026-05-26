## Why no PUT trade was taken after 12 PM

Two independent bugs caused the miss:

1. **Strategy bias** — Between 12:00 and 13:45 the engine produced 0 qualifying BUY_PUT signals despite a 120+ pt drop. The bullish path is aggressive (95% on trend+ADX+volume), but the bearish path requires too many simultaneous confirmations and the new exhaustion guard only *blocks* CALLs without ever flipping to PUT.
2. **Broker token** — The one 95% BUY_PUT that did fire at 13:45 (NIFTY 23500 PE) was rejected by Dhan: `TOKEN_EXPIRED`. Same error blocked 7+ other orders today silently.

## Fix Plan

### A. Strategy: symmetric Breakdown + Auto-Flip (file: `supabase/functions/make-server-c4d79cb7/advanced_ai.tsx`)

1. **Breakdown Detector (mirror of breakout)** — trigger BUY_PUT when:
   - Price breaks pivot-low of last 5 candles AND closes in lower 35% of candle range, OR
   - EMA9 crosses below EMA21 with ADX ≥ 20 and volume ≥ 1.3× avg, OR
   - Price < VWAP − 0.35% with RSI falling through 50 from above.
   Confidence base 80%, +5 each extra confirmation (cap 95%).

2. **Auto-Flip on Exhaustion** — when the existing exhaustion guard blocks BUY_CALL (RSI≥72 + upper BB / VWAP stretch / failed breakout), instead of returning `WAIT`, emit a **BUY_PUT at 75% confidence** if the next candle confirms (close below prior candle low). This is what would have caught the 12:00–12:30 top.

3. **Lower auto-execute threshold for PUT during confirmed downtrend** — if last 3 candles all lower-low + lower-high, accept BUY_PUT ≥ 65% (instead of 70/80%). Today's 12:00 59% would still be skipped, but 12:15/12:30 candles would have qualified.

### B. Broker token visibility (files: `BackendEngineMonitor.tsx` + new banner component)

1. Poll `broker_credentials.last_status` / `access_token_expiry`; when status = `TOKEN_EXPIRED` or expiry < now, render a **sticky red banner** at top of dashboard: *"Dhan token expired — orders are being rejected. Click to update."* with a button linking to Broker Setup.
2. Same banner if `vps_subscription` flag = expired.
3. Add a row in the Engine status panel: "Last order failure reason" so silent broker failures stop hiding.

### C. Logging

Persist `reason` and `blocked_by` into `trading_signals.raw_data` so future "why no trade" questions can be answered in one query instead of reading code.

## Files to change

- `supabase/functions/make-server-c4d79cb7/advanced_ai.tsx` — breakdown detector, auto-flip, lower PUT threshold during downtrend, persist reason.
- `src/app/components/BackendEngineMonitor.tsx` — broker/VPS status banner + last failure row.
- (no DB migration needed — `raw_data` is already jsonb.)

## Out of scope

- No change to UI layout beyond the banner + one status row.
- No change to position monitor / target / SL logic.
- I will not touch the Dhan token itself — you must renew it in Broker Setup; the banner makes that obvious going forward.
