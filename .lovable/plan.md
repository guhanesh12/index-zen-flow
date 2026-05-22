# Auto-Symbol Selection + Centralized Instrument Master Plan

Goal: User selects index (NIFTY / BANKNIFTY / SENSEX) + lot count + moneyness (ATM / ITM / OTM). When engine fires BUY_CALL or BUY_PUT, the correct option symbol is picked automatically from a daily-refreshed shared instrument master, fund-checked, and ordered in milliseconds. Supports up to 3 symbols per user.

---

## 1. Centralized Daily Instrument Master (shared by all users)

**New table**: `instrument_master`
- `symbol` (text, PK part) — e.g. `NIFTY29MAY2523800CE`
- `security_id` (text) — Dhan security ID for order placement
- `index_name` (text) — NIFTY / BANKNIFTY / SENSEX
- `strike_price` (numeric)
- `option_type` (text) — CE / PE
- `expiry_date` (date) — nearest weekly/monthly
- `lot_size` (integer)
- `exchange_segment` (text) — NSE_FNO / BSE_FNO
- `tick_size` (numeric)
- `refreshed_at` (timestamptz)
- Index on `(index_name, expiry_date, option_type, strike_price)` for sub-millisecond lookup

**New cron jobs** (pg_cron):
1. `instrument-master-download-0850-ist` — daily Mon–Fri at **08:50 IST** (03:20 UTC) — calls new edge function `/cron/refresh-instruments`
2. `instrument-master-purge-2400-ist` — daily at **00:00 IST** (18:30 UTC) — deletes old rows (expired contracts / previous-day refresh)

**New edge function endpoint**: `POST /cron/refresh-instruments`
- Downloads Dhan master CSV (`https://images.dhan.co/api-data/api-scrip-master.csv`) — one HTTP call shared across all users (no per-user duplication)
- Filters to: NIFTY, BANKNIFTY, SENSEX index options only
- Keeps current + next weekly expiry (monthly for MIDCPNIFTY-style)
- Bulk inserts into `instrument_master` (truncate-then-insert)
- Skips run on NSE holidays (uses existing `is_trading_day()` function)

Trade-off: shared download = ~3 MB CSV pulled once per day instead of once per user — massive cost saving.

---

## 2. User Symbol Configuration (UI)

**New table**: `user_symbol_config`
- `user_id` (text)
- `slot` (int 1-3) — supports up to 3 symbols per user
- `index_name` (text) — NIFTY / BANKNIFTY / SENSEX
- `moneyness` (text) — ATM / ITM1 / ITM2 / OTM1 / OTM2
- `lot_count` (int) — default 1, multiplied with `instrument_master.lot_size`
- `enabled` (boolean)
- RLS: user manages own rows

**UI changes** (new component `AutoSymbolConfig.tsx` inside dashboard):
- Card per slot (1, 2, 3) with:
  - Dropdown: Index (NIFTY / BANKNIFTY / SENSEX)
  - Dropdown: Moneyness (ATM / ITM-1 / ITM-2 / OTM-1 / OTM-2)
  - Number stepper: Lot count (+/- buttons, default 1, max 50)
  - Toggle: Enabled
  - Live preview: "ATM CE strike ~23800, lot size 75, qty = 75 × 1 = 75, est cost ≈ ₹X"
- "Add Symbol" button (until 3 slots used)
- Replaces / sits above the existing manual `InstrumentSelector` for auto-mode users

---

## 3. ATM / ITM / OTM Calculation Logic

Runs inside engine tick when a BUY_CALL / BUY_PUT signal fires:

```text
1. Fetch live LTP of index (already done — used for signal)
2. Get strike_gap from IndicesConfig: NIFTY=50, BANKNIFTY=100, SENSEX=100
3. atm_strike = round(LTP / strike_gap) * strike_gap
4. For CE: ITM = atm - (n * gap), OTM = atm + (n * gap)
   For PE: ITM = atm + (n * gap), OTM = atm - (n * gap)
5. Lookup instrument_master WHERE index=? AND expiry=nearest AND option_type=? AND strike=target_strike
6. Returns security_id + lot_size in <1ms (indexed query)
```

Examples (NIFTY @ 23,815):
- ATM CE → 23800CE
- ITM-1 CE → 23750CE (in-the-money for call = lower strike)
- OTM-1 CE → 23850CE

---

## 4. Fund-Aware Order Placement

Before placing each order:
1. Fetch broker fund-limits via existing Dhan service (already cached)
2. `required_margin = ltp_of_option × qty × lot_size` (option premium-based estimate)
3. If `available_funds < required_margin`: skip order, log `INSUFFICIENT_FUNDS` to signal_stats, send notification
4. If multi-symbol signal at same tick: process slot 1 → slot 2 → slot 3 sequentially, deduct used margin per step

---

## 5. Engine Integration (persistent_engine.tsx)

When `advanced_ai.tsx` returns `BUY_CALL` / `BUY_PUT` for an index:
- Loop through user's enabled `user_symbol_config` slots matching that index
- For each: compute strike → lookup `instrument_master` → fund check → place order via existing Dhan order path
- All steps target **<50ms total** (instrument lookup is in-memory after first hit per tick via simple Map cache)

---

## 6. Backtest Compatibility

- Backtest uses same `instrument_master` lookups so historical runs match live behavior
- No new error paths — graceful skip if instrument not found (logged as `SYMBOL_NOT_AVAILABLE`)

---

## Files to be created / changed

**New:**
- `supabase/functions/make-server-c4d79cb7/instrument_refresh.tsx` (download + filter logic)
- `src/app/components/AutoSymbolConfig.tsx` (UI)
- Migration: `instrument_master`, `user_symbol_config` tables + 2 cron jobs

**Edited:**
- `supabase/functions/make-server-c4d79cb7/persistent_engine.tsx` — auto-symbol resolver + fund check + multi-slot loop
- `supabase/functions/make-server-c4d79cb7/index.ts` — register `/cron/refresh-instruments` route
- `src/app/components/dashboard/DashboardUI.tsx` — mount `AutoSymbolConfig`

No changes to `advanced_ai.tsx` (signal logic stays intact from yesterday's fix).

---

## Performance & Cost

| Item | Time | Notes |
|---|---|---|
| Daily CSV download | 1× per day | ~3 MB, ~2 s — shared across ALL users |
| Instrument lookup per signal | <1 ms | indexed Postgres query, cached in-tick |
| Fund check per order | ~50 ms | cached 30 s |
| Total signal → order placed | **<150 ms** | well within your "millisecond" target |

---

## Credit Estimate

This build touches ~5 files (2 new, 3 edited) + 1 migration + 1 new edge function endpoint + UI component with 3 slot cards. Lovable build credits are usage-based — typical scope of this size lands around **8–14 credits** depending on iteration rounds. Daily runtime cost on Lovable Cloud is negligible (1 CSV pull + ~100 small queries per user per day) — well inside your free $25/mo Cloud balance.

---

## Awaiting your approval

Reply **"approve build"** and I will:
1. Create the migration (tables + cron jobs) — you approve it in one click
2. Build the edge function refresh endpoint
3. Build the `AutoSymbolConfig` UI
4. Wire auto-symbol resolver into the engine
5. Run the manual instrument refresh once so tomorrow morning is ready
6. Confirm with a dry-run that lookup + fund-check + order path completes in <150 ms
