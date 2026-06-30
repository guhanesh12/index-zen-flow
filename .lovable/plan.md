# Per-Admin Hotkey Login with 2FA + Tab Permissions

## Goal
Make each admin user fully isolated:
1. Every admin has their **own unique hotkey** (e.g. `GUHAN`, `RAVI`, `ADMIN2`).
2. Pressing that hotkey opens the admin login page **scoped to that admin only** — only their email/password works there. Another admin's credentials must fail.
3. On the **first successful login**, show a **Google Authenticator QR** to bind 2FA. The secret is saved against that admin.
4. Every subsequent login on that hotkey requires email + password + 6-digit TOTP code from Google Authenticator.
5. After login, the admin only sees the **tabs assigned** to them in their `role` permissions.

## Current state (already working)
- Admin user creation with tab permissions ✅
- Hotkey storage in KV (`admin:hotkey:*`) ✅
- `/admin/generate-unique-code` endpoint generates a temporary URL token ✅
- Redirect to `/admin/hotkey/:uniqueCode/login` ✅

## What's broken / missing
- The unique code is not bound to a **specific admin user**, so any admin's credentials work on any hotkey login page.
- No first-login 2FA enrollment flow (QR generation).
- No TOTP verification on subsequent logins.
- Tab permissions not strictly enforced after login (UI only).

---

## Implementation

### 1. Backend — bind hotkey → admin
In `make-server-c4d79cb7`:
- **Hotkey record** must store `adminId` (already does). Ensure `/admin/generate-unique-code`:
  - Looks up hotkey → returns `{ uniqueCode, adminId }`.
  - Stores `admin:unique-code:<code> = { adminId, hotkey, expiresAt: now+5min }`.
- **New endpoint** `POST /admin/login-with-hotkey`:
  - Body: `{ uniqueCode, email, password, totpCode? }`.
  - Validates unique code → resolves bound `adminId`.
  - Loads admin record; **rejects if email/password don't match THAT admin**.
  - If admin has no `twoFactorSecret` yet → generate one (otpauth secret), save as `twoFactorSecret` with `twoFactorEnabled=false`, return `{ needsEnrollment: true, qrDataUrl, secret }`.
  - If `twoFactorEnabled=true` → require `totpCode`, verify with TOTP window ±1, reject otherwise.
- **New endpoint** `POST /admin/confirm-2fa`:
  - Body: `{ uniqueCode, email, password, totpCode }`.
  - Verifies code against pending secret → sets `twoFactorEnabled=true`, issues admin session token.
- Session token must encode `adminId` + permitted tabs.

### 2. Frontend — hotkey login page
`AdminHotkeyLogin` (route `/admin/hotkey/:uniqueCode/login`):
- Step 1: email + password form → POST `/admin/login-with-hotkey`.
- Step 2a (first time): show QR (`qrDataUrl`) + manual secret + input for 6-digit code → POST `/admin/confirm-2fa`.
- Step 2b (returning): show 6-digit TOTP input alongside email/password.
- On success, store session and redirect to admin dashboard.

### 3. Tab permission enforcement
- `AdminDashboard`: read `permissions` from session, hide and **route-guard** every tab not in the list.
- `withHotkeyProtection`: also check `permissions[pageName]`.

### 4. TOTP library
Use `otpauth` (Deno-compatible) inside the edge function for secret generation + verification, and `qrcode` to render data URL.

---

## Files to touch
- `supabase/functions/make-server-c4d79cb7/index.ts` — new endpoints, unique-code binding, TOTP.
- `src/app/components/AdminHotkeyLogin.tsx` (create or update) — new 2-step flow.
- `src/app/components/AdminDashboard.tsx` — enforce per-tab permissions from session.
- `src/app/components/withHotkeyProtection.tsx` — check permissions.
- `src/app/routes.tsx` — ensure hotkey login route renders new component.

## Acceptance
- Pressing `Ctrl+Alt+GUHAN` only logs in admin GUHAN; other admin credentials fail with "Invalid credentials for this hotkey".
- First login shows QR for Google Authenticator; subsequent logins require the 6-digit code.
- Admin only sees their assigned tabs; direct URL access to other tabs is blocked.

Shall I proceed with this implementation?
