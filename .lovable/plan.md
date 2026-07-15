
# Implementation Plan

## 1. Auto engine-off + subscriber email on any position auto-close

**Backend (DB trigger + edge function):**
- Extend existing `trg_position_close_notify` trigger on `position_monitor_state`. When `is_active` transitions to `false` AND `exit_reason` is auto (SL / target / auto-exit / risk):
  - Call `net.http_post` to a new edge function `on-position-auto-close` with `{ user_id, symbol, pnl, exit_reason, order_id }`.
- New edge function `on-position-auto-close`:
  1. Set `trading_engine_state.is_running = false`, `stopped_reason = 'Auto engine off: position auto-closed (<reason>)'` for that user.
  2. Clear KV `engine_running:<uid>` = false.
  3. Look up user email + name, then call `send-email` with new template `position_auto_close` containing symbol, pnl, reason, timestamp, and CTA to dashboard.
  4. Push notification is already handled by existing trigger.

## 2. Admin Manual/Bulk Email Sender

**New admin tab: "Broadcast Mail"** (`AdminBroadcastMail.tsx`) under Communication section.

Features:
- **Segment picker** (auto-computed from DB):
  - All users
  - Active subscribers (email_enabled = true)
  - VPS renewal due (7 / 15 / 30 days — from `broker_credentials` or a `vps_expiry` field; if missing, from KV `vps_expiry:<uid>`)
  - Wallet low (< ₹50)
  - Referrers (users with ≥1 referral)
  - Inactive 30d (no login)
  - Custom: multi-select users from table with search
- **Compose form:** subject, heading, body (rich text / markdown), optional CTA button (label + URL), banner image URL.
- **Live preview** (right pane) rendering the branded template.
- **Send test to me** button.
- **Send** → queues to new edge function `admin-broadcast-mail` which loops recipients, throttles (Brevo 10/sec), logs each into `email_logs` with `template = 'broadcast'`, campaign_id.
- **Delivery report** table filtered by campaign_id.

**New table:** `email_campaigns` (id, admin_user_id, subject, body, segment, cta_label, cta_url, banner_url, total, sent, failed, created_at).

**New edge function:** `admin-broadcast-mail`
- Verifies caller is admin via `is_super_admin` or `has_permission('communication','create')`.
- Resolves segment → email list server-side.
- Uses Brevo API (existing `BREVO_API_KEY`) with new branded template.

## 3. Advanced Branded HTML Email Template

Update `send-email/index.ts` with a new master template renderer (`renderBrandedEmail`) — dark IndexPilot AI theme:
- Header: gradient (cyan→purple), logo, brand name
- Hero card with heading + icon
- Body content block (white on dark)
- Optional CTA button (rounded, gradient)
- Optional data table (used for position close: symbol / entry / exit / P&L)
- Footer: unsubscribe link, address, social icons

Applied to: `position_auto_close`, `broadcast`, and back-ported to `welcome`, `wallet_recharge`, `buy_call`, `buy_put`, `trade_exit`.

## 4. RN App Profile API Spec (docs only)

Create `docs/RN_APP_PROFILE_SPEC.md` covering:
- Auth flow (Supabase JWT bearer)
- Endpoints:
  - `GET profiles` (self) — full schema of 23 columns
  - `PATCH profiles` — editable fields (full_name, mobile, avatar_url, address, pan, etc.)
  - `GET wallet:<uid>` via KV
  - `GET wallet_transactions` (paginated)
  - `GET referral_codes` + `GET referral_earnings`
  - `POST avatar upload` → `avatars` bucket
  - `POST profiles/change-password` via supabase.auth
  - `GET notification_preferences` + `PATCH`
  - `GET broker_credentials` (masked)
- For each: URL, method, request headers, request body JSON, sample success JSON, error codes.
- **RN UI implementation prompt** — a copy-paste prompt for another AI to build the RN Profile screen with: avatar w/ edit, personal info card, wallet card, referral card, notification toggles, broker status, security section, logout — using NativeWind + Expo Router + `@supabase/supabase-js`, dark theme matching IndexPilot AI.

## Files

**New:**
- `supabase/functions/on-position-auto-close/index.ts`
- `supabase/functions/admin-broadcast-mail/index.ts`
- `src/app/components/AdminBroadcastMail.tsx`
- `docs/RN_APP_PROFILE_SPEC.md`

**Modified:**
- `supabase/functions/send-email/index.ts` (branded renderer + new templates)
- `src/app/components/AdminCommunication.tsx` (add "Broadcast" sub-tab)
- Migration: trigger update + `email_campaigns` table + grants + RLS

## Order of build
1. Migration (trigger + email_campaigns table)
2. `send-email` branded template + `position_auto_close` template
3. `on-position-auto-close` edge function
4. `admin-broadcast-mail` edge function
5. Admin UI (`AdminBroadcastMail.tsx`) + wire into Communication
6. RN spec doc

Ready to proceed?
