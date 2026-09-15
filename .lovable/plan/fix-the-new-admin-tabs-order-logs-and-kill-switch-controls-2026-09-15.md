# Fix the new admin tabs, order logs and kill switch controls

## What is wrong today

The four new admin screens (Positions & Orders, Order Logs, Strategy Control, Kill Switch) read the database directly from the browser. Admin panel sessions opened through the hotkey link are not signed in as a normal app user, so those direct reads come back empty — that is why today's orders, the saved strategy and the switches all look blank even though the data exists.

The user-side kill switch is placed on the Broker tab only, so it is easy to miss.

## What will change

### 1. Admin screens get real data
Add admin-only endpoints on the existing backend (same admin check the other admin screens already use) for:
- daily position / order counts and overall P&L, date-range filtered (IST)
- order logs with every field: date & time, broker order ID, order ID, signal ID, strategy ID, algo ID, client ID / name / email, broker, index, symbol, side, quantity, average price, status, plus the full audit trail
- read + save for Strategy Control
- read + save for the global Kill Switch and per-user switches

The four screens will call these endpoints instead of reading the database directly, so they work in the hotkey admin session.

### 2. Order Logs — today by default
- Opens on today's date with a date / date-range picker.
- Broker order ID shown as its own column (not only inside the expanded row).
- Expanding a row shows the linked signal (time, index, direction, confidence, strike, signal ID) next to the order detail and audit trail.
- CSV export keeps all the same columns.

### 3. Positions & Orders — full detail
- Date-wise breakdown table (per day: orders, positions opened / closed, realised P&L).
- Sub-tabs keep Order Count, User Details, Profit Earned; each row shows client ID, name, email, broker, orders, P&L.

### 4. Kill Switch tab gets SL / target control
New section in the Kill Switch screen with two modes:
- **Auto** — the engine decides stop loss and target from its own rules (current behaviour).
- **Manual** — admin sets target and stop loss per lot (₹) per index; these values are applied as the platform default for users who have not set their own.

Same manual / auto choice is exposed to the user in their own settings, and the position monitor runs the chosen stop loss live (1-second refresh, existing monitor logic, using the manual values when manual mode is on).

### 5. User-side kill switch placement
Keep it on the Broker tab and also show it in the user's More / Settings area so it is easy to find, with the admin-paused badge when the platform switch is off.

## Technical notes

- New routes on `make-server-c4d79cb7` guarded by `validateAdminAuth`, mirroring `/admin/market-data/signal-history`.
- Frontend: `AdminPositionsOrders.tsx`, `AdminOrderLogs.tsx`, `AdminStrategyControl.tsx`, `AdminKillSwitch.tsx` switch from `supabase.from(...)` to authenticated `fetch` with the admin access token.
- Manual SL/TP values stored on `kill_switch_config` (new columns: `sl_tp_mode`, per-index target / stop per lot) via migration; user overrides continue to live in `user_symbol_config`.
- `UserKillSwitch.tsx` reused in the second location; no duplicate state.
- Backend deploy with `supabase--deploy_edge_functions`.
