
# Security Activity Monitor & Auto-Suspend

Build a new Settings → Security Activity panel that shows all user and admin activity in real-time and auto-suspends suspicious accounts so they lose all database access.

## What you'll get

1. **New `SecurityActivityMonitor` component** (in Settings section)
   - Live feed of all activity from `security_audit_log` and `failed_login_attempts`
   - Filters: by user / by admin / by event type / by status / by date
   - Severity badges (info / warning / critical)
   - Search by email, IP, action
   - Stats cards: total events today, failed logins, blocked IPs, suspended users
   - Manual suspend / unsuspend buttons (admin only)

2. **Auto-Suspend Engine** (database + RLS)
   - New `account_status` flag on `profiles` → `active | suspended | banned`
   - New `suspended_users` table with reason, suspended_at, suspended_by, auto/manual flag
   - Detection rules (run on every audit log insert via trigger):
     - 5+ failed logins in 15 min → auto-suspend
     - 10+ different IPs in 1 hour → auto-suspend (account sharing / bot)
     - Access attempt from blocked IP → auto-suspend
     - Admin action without 2FA → flag + alert
   - **Block all DB access** for suspended users via new RLS helper `is_account_active(uid)` added to every user-facing policy

3. **Activity Logger Hook** (`useActivityLogger`)
   - Wraps key actions across the app (login, trade, order, settings change, admin action)
   - Writes to `security_audit_log` with action, resource, IP, user agent, metadata
   - Already-built `AuditLogger.ts` will be extended with batching + offline queue

4. **Frontend API integration** (`src/app/utils/securityApi.ts`)
   - Wrappers for all 9 security endpoints already built in backend
   - CAPTCHA UI component for login/register
   - Password strength meter component
   - Email validator on signup form

5. **Admin alerts**
   - Toast notification when auto-suspend fires
   - Optional email to platform owner via existing send-email function

## Technical details

**Database migration:**
- `ALTER TABLE profiles` — add CHECK constraint on `account_status`, default `active`
- `CREATE TABLE suspended_users` (user_id, reason, rule_triggered, suspended_at, suspended_by, auto, unsuspended_at)
- `CREATE FUNCTION is_account_active(uid)` SECURITY DEFINER
- `CREATE FUNCTION auto_suspend_check()` trigger function on `failed_login_attempts` INSERT
- Update RLS on all user tables (`trading_orders`, `trading_signals`, `user_symbols`, `user_symbol_config`, `position_monitor_state`, `trading_engine_state`, `broker_credentials`, `wallet_transactions`, `notification_preferences`) to add `AND is_account_active(auth.uid())`

**Files to create:**
- `src/app/components/SecurityActivityMonitor.tsx` — main UI
- `src/app/components/CaptchaWidget.tsx` — reusable CAPTCHA
- `src/app/components/PasswordStrengthMeter.tsx` — reusable meter
- `src/app/utils/securityApi.ts` — endpoint wrappers
- `src/app/hooks/useActivityLogger.ts` — logging hook
- Migration file for suspend system

**Files to edit:**
- `src/utils-ext/security/AuditLogger.ts` — add batching + activity types
- `SettingsPanel.tsx` — add "Security Activity" tab
- Login/Register screens — wire CAPTCHA + password meter + email validator

## Out of scope (ask later if needed)
- Geo-IP lookup / country blocking
- ML-based anomaly detection
- 2FA enforcement changes (already in place per your earlier message)
