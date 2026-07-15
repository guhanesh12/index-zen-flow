# IndexPilot AI — React Native Profile Screen Spec

Complete API + UI reference for building the **Profile** screen in the RN app.

> Backend: Supabase (`https://oklgqelcaujxntgjyuis.supabase.co`)
> Auth: Supabase JWT (Bearer access token from `supabase.auth.getSession()`)
> All requests use `Authorization: Bearer <access_token>` + `apikey: <SUPABASE_PUBLISHABLE_KEY>`.

---

## 0. Client bootstrap

```ts
// src/lib/supabase.ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://oklgqelcaujxntgjyuis.supabase.co',
  'eyJhbGciOi...ANON_KEY...',
  { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } }
);
```

Environment:
- `SUPABASE_URL = https://oklgqelcaujxntgjyuis.supabase.co`
- `SUPABASE_ANON_KEY = <VITE_SUPABASE_PUBLISHABLE_KEY>`
- `FUNCTIONS_BASE = https://oklgqelcaujxntgjyuis.supabase.co/functions/v1`

---

## 1. Get profile (self)

**Method:** `GET` via PostgREST
**URL:** `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.<uid>&select=*`
**Or (recommended):** `supabase.from('profiles').select('*').eq('user_id', user.id).single()`

**Response (200) — 23 fields:**
```json
{
  "user_id": "uuid",
  "client_id": "ALG0042",
  "full_name": "Rahul Sharma",
  "email": "rahul@example.com",
  "mobile": "+919876543210",
  "avatar_url": "https://…/avatars/uid.jpg",
  "address": "…",
  "city": "Chennai",
  "state": "TN",
  "pincode": "600001",
  "country": "IN",
  "pan": "ABCDE1234F",
  "aadhaar_masked": "XXXX-XXXX-1234",
  "date_of_birth": "1995-04-12",
  "occupation": "Engineer",
  "signup_bonus_credited": true,
  "signup_bonus_amount": 100,
  "signup_bonus_remaining": 40,
  "signup_bonus_expires_at": "2026-07-22T…",
  "referred_by": "ALG0001",
  "kyc_status": "verified",
  "created_at": "…",
  "updated_at": "…"
}
```

**Errors:** `401` unauthorized · `PGRST116` (no row) → treat as needs onboarding.

---

## 2. Update profile

**Method:** `PATCH`
**URL:** `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.<uid>`
**Or:** `supabase.from('profiles').update(patch).eq('user_id', user.id)`

**Editable body:**
```json
{ "full_name": "…", "mobile": "…", "avatar_url": "…", "address": "…",
  "city": "…", "state": "…", "pincode": "…", "date_of_birth": "…", "occupation": "…" }
```

Non-editable client-side: `client_id`, `email`, `signup_bonus_*`, `kyc_status`, `pan`.

---

## 3. Avatar upload

**Bucket:** `avatars` (public)
```ts
const path = `${user.id}/${Date.now()}.jpg`;
await supabase.storage.from('avatars').upload(path, file, { contentType: 'image/jpeg', upsert: true });
const { data } = supabase.storage.from('avatars').getPublicUrl(path);
await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('user_id', user.id);
```

---

## 4. Wallet

**KV read:**
```ts
const { data } = await supabase.from('kv_store_c4d79cb7')
  .select('value').eq('key', `wallet:${user.id}`).maybeSingle();
// data.value => { balance, totalProfit, totalDeducted, createdAt, lastUpdated }
```

**Transactions (paginated):**
```ts
supabase.from('wallet_transactions')
  .select('*').eq('user_id', user.id)
  .order('created_at', { ascending: false })
  .range(page*20, page*20 + 19);
```
Row fields: `id, user_id, type, amount, reference_id, description, created_at`.
`type` ∈ `credit | debit | bonus | refund | profit | referral | signup_bonus | bonus_expired | fee | loss`.

---

## 5. Referrals

**Referral code:** `supabase.from('referral_codes').select('code').eq('user_id', user.id).single()`
**Earnings:** `supabase.from('referral_earnings').select('*').eq('user_id', user.id).single()`
→ `{ pending_count, verified_count, total_earned, updated_at, … }`
**List of referred users:** `supabase.from('referrals').select('*').eq('referrer_user_id', user.id)`
Share URL: `https://indexpilotai.com/signup?ref=<code>`

---

## 6. Notification preferences

```ts
// Get
supabase.from('notification_preferences').select('*').eq('user_id', user.id).maybeSingle();
// Update
supabase.from('notification_preferences').upsert({
  user_id: user.id, email_enabled: true, sms_enabled: false, whatsapp_enabled: false,
  push_enabled: true, trade_alerts: true
});
```

Row: `{ user_id, email_enabled, sms_enabled, whatsapp_enabled, push_enabled, trade_alerts, updated_at }`.
Note: enabling `email_enabled` auto-debits ₹5/day on active trading days.

---

## 7. Broker connection (masked)

```ts
supabase.from('broker_credentials').select(
  'broker, auth_method, dhan_client_id, dhan_client_name, given_power_of_attorney, ' +
  'access_token_expiry, api_key_expiry, last_status, last_error, updated_at'
).eq('user_id', user.id).maybeSingle();
```

Show badge: **Connected** if `access_token_expiry > now()`, else **Reconnect required**.
Days-until-expiry chip drives the "renewal" reminder.

---

## 8. Change password

```ts
await supabase.auth.updateUser({ password: newPassword });
```
The backend automatically sends a `password_changed` confirmation email.

---

## 9. Push token registration (FCM)

Edge function: `POST ${FUNCTIONS_BASE}/push-subscribe`
```json
{ "token": "<fcm_token>", "platform": "android" | "ios", "device_id": "…" }
```
Headers: `Authorization: Bearer <access_token>`.

---

## 10. Logout

```ts
await supabase.auth.signOut();
// Clear cached FCM token, navigate to /login
```

---

## 11. Standard error handling

| Code | Meaning | UI action |
|------|---------|-----------|
| 401 | Session expired | Refresh session, else force login |
| 403 | RLS blocked | Show "You don't have access" toast |
| 409 | Conflict (unique) | Field-level error |
| 429 | Rate-limited | "Too many attempts, try later" |
| 500 | Server error | Retry button |

---

# ✂️ Copy-Paste Prompt for the RN Builder AI

> Build the **Profile screen** for the IndexPilot AI React Native app (Expo + Expo Router + NativeWind + `@supabase/supabase-js`). Follow the API spec in `docs/RN_APP_PROFILE_SPEC.md`.
>
> **Design system**
> - Dark theme. Background `#0B1220`, surface `#111827`, border `#1F2937`.
> - Accent: cyan `#22D3EE` / gradient to purple `#8B5CF6`. Gold micro-accent `#F4B400`.
> - Font: system (SF Pro on iOS, Roboto on Android). Headings 700, body 500, caption 400.
> - Rounded 2xl cards, generous 16-24px padding, subtle inner border `border-white/10`.
> - Motion: 250 ms ease-out for taps, spring 200 for pull-to-refresh.
>
> **Screen structure (single scroll)**
> 1. **Header card** — circular avatar (tap to change), name, client ID pill (`ALG0042`), verified badge if `kyc_status === 'verified'`. Edit button top-right.
> 2. **Wallet card** — big balance `₹1,240.50`, small chips: `Bonus ₹40 left · expires in 3d`, buttons `Recharge` / `History`.
> 3. **Personal info** — email (read-only), mobile, address, city/state/pincode, DOB, occupation. Inline edit modal.
> 4. **Referral card** — big code `ALG0042`, `Total earned ₹2,150 · 12 friends`. Share button (native share sheet).
> 5. **Broker connection** — logo (Dhan), status pill (Connected / Reconnect), expiry countdown, `Reconnect` button.
> 6. **Notifications** — toggle rows: Email alerts (with `₹5/day` sublabel), Push, SMS, WhatsApp, Trade alerts.
> 7. **Security** — Change password, 2FA, biometric unlock toggle.
> 8. **About** — App version, Terms, Privacy, Support (opens ticket), Logout (red).
>
> **Data hooks**
> - `useProfile()`, `useWallet()`, `useTransactions()`, `useReferral()`, `useNotificationPrefs()`, `useBroker()` — each returns `{ data, loading, error, refresh }` using `supabase-js`.
> - Pull-to-refresh at screen root re-fetches all.
> - Optimistic updates on toggles + PATCH to profiles/notification_preferences.
>
> **Endpoints** (see spec above for full payloads):
> - `profiles` (SELECT + UPDATE self)
> - `kv_store_c4d79cb7 key='wallet:<uid>'` (SELECT)
> - `wallet_transactions` (SELECT paginated)
> - `referral_codes`, `referral_earnings`, `referrals` (SELECT)
> - `notification_preferences` (UPSERT)
> - `broker_credentials` (SELECT masked columns)
> - `storage.avatars` (upload)
> - `auth.updateUser` (change password)
> - `functions/push-subscribe` (register FCM token)
>
> **Non-negotiables**
> - Never send `service_role` key from the app.
> - Handle 401 by calling `supabase.auth.refreshSession()` once, then redirect to `/login` if still failing.
> - Cache the profile with React Query (`staleTime: 30_000`) keyed by `user.id`.
> - Every destructive action (logout, disconnect broker, change password) requires a confirm modal.
> - Accessibility: min 44×44 tap targets, `accessibilityLabel` on all icons.
>
> Ship a single `app/(tabs)/profile.tsx` route plus supporting components under `components/profile/*`.
