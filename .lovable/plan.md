## Goal

Cut DigitalOcean costs by automatically powering VPS off outside Indian market hours, and give admins visibility + manual override (without taking control away from users).

## Schedule (IST, Asia/Kolkata)

- Power **OFF**: every trading day at **15:31 IST** (after market close)
- Power **ON**: every trading day at **08:55 IST** (before market open)
- **Weekends (Sat/Sun)**: stay OFF — no auto-on
- **Monday morning 08:55 IST**: auto-on resumes
- Special trading sessions (e.g. Diwali Muhurat): admin can manually power-on all VPS via a button

## What gets built

### 1. Backend — VPS power scheduler

- New edge function endpoints in `make-server-c4d79cb7`:
  - `POST /vps-power/auto-shutdown` — loops all assigned VPS, calls DigitalOcean `droplet/actions { type: "shutdown" }`
  - `POST /vps-power/auto-startup` — calls `{ type: "power_on" }`
  - `POST /vps-power/all-on` — admin-only manual "turn ON all VPS" (for Muhurat / special sessions)
  - `POST /vps-power/all-off` — admin-only manual kill switch
  - `POST /vps-power/toggle/:userId` — admin manual single VPS toggle
  - `GET  /vps-power/status` — returns per-user `{ userId, email, ip, dropletId, powerStatus: on|off|provisioning, lastAction, lastActionAt }`
- Schedule via Supabase `pg_cron` + `pg_net`:
  - `31 10 * * 1-5` UTC (= 15:31 IST Mon–Fri) → auto-shutdown
  - `25 03 * * 1-5` UTC (= 08:55 IST Mon–Fri) → auto-startup
- Skip logic: if VPS is already in target state, no-op (saves API calls).
- Persist a `vps_power_schedule_enabled` flag in KV (admin can toggle the whole automation on/off).

### 2. Admin UI — new "VPS Control" tab in Settings

Location: `AdminSettings.tsx` → add new tab "VPS Power"

- **Master toggle**: Auto-schedule ON/OFF
- **Manual buttons**: "Power ON all VPS", "Power OFF all VPS", "Special Trading Day (keep ON today)"
- **Live VPS status table** (polls every 10s):
| User Email | Static IP | Droplet ID | Power Status | Engine Status | Last Action |
  - Power Status badge: green=ON, gray=OFF, amber=provisioning
  - Engine Status: read-only badge (Running/Stopped) — admin **cannot** start/stop user engines
- Per-row "Power On" / "Power Off" admin override button (VPS only, not engine)

### 3. User UI — status messages in Static IP section

In `UserDedicatedIPManager.tsx`:

- Show banner under the IP card based on VPS power state:
  - 🟢 "Server is ONLINE — ready for trading"
  - 🌙 "Server is OFF — auto-restarts at 8:55 AM IST on the next trading day (cost saver)"
  - ⚡ "Special trading session — server kept online by admin"
- Surface IP + power status; engine controls remain user-owned.

## Technical details

- Use `DIGITALOCEAN_API_TOKEN` already in secrets.
- DO API: `POST https://api.digitalocean.com/v2/droplets/{id}/actions` with `{type:"shutdown"|"power_on"}`.
- Store last power state per user in KV: `vps:power:{userId} = { state, at, source: 'cron'|'admin'|'user' }`.
- Cron job inserted via Supabase insert tool (not migration) since it contains the function URL + anon key.
- Admin endpoints gated by existing admin JWT check pattern used in `index.ts`.
- All times computed in IST; cron expressed in UTC.

## Files to change

- `supabase/functions/make-server-c4d79cb7/vps_power.tsx` (new)
- `supabase/functions/make-server-c4d79cb7/index.ts` (wire routes)
- `src/app/components/AdminSettings.tsx` (new VPS Power tab)
- `src/app/components/AdminVPSPower.tsx` (new component)
- `src/app/components/UserDedicatedIPManager.tsx` (status banner)
- pg_cron schedule (via Supabase insert tool)

## Out of scope

- No changes to signal engine, AI accuracy, or order logic.
- Admin cannot control user trading engines — status display only.

ADMIN USER SECTION ALOCATED IP SHOW NEED AND SEVER STSUS NEED AND ENGINE STATUS NEED AND NOT ALOW FOR ADMIN USER ENGINE CONTROLL REMON USER SECTION ON OFF BUTTON I NEED REAL ENGINE STAATSU SHOW FOR ALL USER SPARATLY THEN AUTO ENGIN OFF FOR EVERY DAY 3.31 EVEING ENGIN OFF NEED 