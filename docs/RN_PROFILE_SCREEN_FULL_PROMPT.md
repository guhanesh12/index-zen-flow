# React Native — Profile Screen (IndexPilot AI)
## Full line-by-line prompt for Blackbox / Cursor / Gemini

> Paste EVERYTHING below into your RN builder. This is the ONLY spec that matches the live backend. Older prompts referenced `profiles` table directly — that returns partial data because `referral_code`, `earnings`, `wallet balance` and `notification prefs` live in **different tables**. Use the edge-function endpoint `/profile/me` (single source of truth) + specific endpoints for the rest.

---

## 0. Base config

```ts
export const SUPABASE_URL  = 'https://oklgqelcaujxntgjyuis.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rbGdxZWxjYXVqeG50Z2p5dWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MTA0NjUsImV4cCI6MjA3NTA4NjQ2NX0.FnFcNQXGXGpsQXvR4TW1LDc23FlIBBglLhZsRdn9VV0';
export const FN_BASE       = `${SUPABASE_URL}/functions/v1/make-server-c4d79cb7`;
```

Every request MUST send BOTH headers:
```
Authorization: Bearer <supabase_access_token>
apikey: <SUPABASE_ANON>
Content-Type: application/json
```

Get the access token **only after auth hydration is finished**:
```ts
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;
```
If `token` is null before hydration is finished, do not call APIs yet. Show `Loading session...`. If hydration is finished and token is still null → force login. If a request returns 401 → call `supabase.auth.refreshSession()` once, retry, else logout.

**Critical RN bug fix:** remove any AsyncStorage timeout wrapper that logs `Storage timeout - continuing with null values`. It causes false `NOT_SIGNED_IN` by returning `null` before Supabase restores the saved session.

---

## 1. THE profile endpoint (use this — do NOT hit `profiles` table directly)

### GET profile + referral + earnings in ONE call
```
GET  {FN_BASE}/profile/me
```
**Response 200:**
```json
{
  "profile": {
    "user_id": "uuid",
    "client_id": "ALG0001",
    "email": "guhanesh1234@gmail.com",
    "full_name": "Guhanesh",
    "mobile": "8940850406",
    "photo_url": "https://.../avatars/uid.jpg",
    "kyc_status": "pending",
    "account_status": "active",
    "role": "user",
    "broker_connected": false,
    "welcome_popup_seen": true,
    "tour_completed": false,
    "profile_completion": 80,
    "signup_bonus_credited": true,
    "signup_bonus_amount": 100,
    "signup_bonus_remaining": 40,
    "signup_bonus_expires_at": "2026-07-22T...",
    "referred_by": null,
    "created_at": "2026-05-08T...",
    "updated_at": "..."
  },
  "referralCode": "ALG0001",
  "earnings": {
    "total_earned": 0,
    "total_pending": 0,
    "successful_count": 4,
    "pending_count": 0
  }
}
```

### PATCH profile
```
PATCH {FN_BASE}/profile/me
Body: { "full_name"?: string, "mobile"?: string, "photo_url"?: string }
```
Only these 3 fields are editable client-side. Response: `{ success: true, profile: <full row> }`.

**IMPORTANT:** editing `email`, `client_id`, `kyc_status`, `role`, `account_status` is BLOCKED by the backend — do not show inputs for them.

---

## 2. Wallet balance
```
GET  {FN_BASE}/wallet/balance
→ { "balance": 93860, "totalProfit": 0, "totalDeducted": 0, "lastUpdated": "..." }
```

## 3. Wallet transactions (paginated)
```
GET  {FN_BASE}/wallet/transactions?limit=20&offset=0
→ { "transactions": [{ id, type, amount, description, reference_id, created_at }], "total": 42 }
```
`type` ∈ `credit | debit | bonus | refund | profit | referral | signup_bonus | bonus_expired | fee | loss`.

## 4. Referrals list
```
GET  {FN_BASE}/referral/my
→ { "referrals": [{ referee_user_id, referee_name, status, reward_amount, created_at }], "earnings": {...} }
```
Share URL = `https://indexpilotai.com/register?ref=<referralCode>`

## 5. Broker connection status
```
GET  {FN_BASE}/broker/oauth/status
→ { "connected": true|false, "broker": "dhan", "client_id": "...", "expires_at": "...", "days_left": 12 }
```

## 6. Notification preferences (email/sms/push toggles)
Direct table read/write (RLS-protected):
```ts
// GET
const { data } = await supabase.from('notification_preferences')
  .select('*').eq('user_id', user.id).maybeSingle();
// UPSERT
await supabase.from('notification_preferences').upsert({
  user_id: user.id,
  email_enabled: true,          // ₹5/day auto-debit on trading days when ON
  sms_enabled:   false,
  whatsapp_enabled: false,
  push_enabled:  true,
  trade_alerts:  true,
});
```

## 7. Avatar upload
```ts
const path = `${user.id}/${Date.now()}.jpg`;
await supabase.storage.from('avatars')
  .upload(path, { uri: fileUri, type: 'image/jpeg', name: 'a.jpg' } as any, { upsert: true, contentType: 'image/jpeg' });
const { data } = supabase.storage.from('avatars').getPublicUrl(path);
// then PATCH /profile/me { photo_url: data.publicUrl }
```

## 8. Change password
```ts
await supabase.auth.updateUser({ password: newPassword });
```

## 9. Logout
```ts
await supabase.auth.signOut();
// clear FCM token, navigate to /login
```

---

## 10. Single hook that loads everything (COPY THIS — this is why prior attempts failed)

Before using this hook, your RN app must expose `authReady`, `session`, and `user` from AuthContext. Protected endpoints must not run until `authReady === true && session`.

```ts
// hooks/useProfileScreen.ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { FN_BASE, SUPABASE_ANON } from '../lib/config';
import { useAuth } from '../contexts/AuthContext';

async function authFetch(path: string, session, init: RequestInit = {}) {
  let token = session?.access_token;
  if (!token) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token;
  }
  if (!token) throw new Error('NOT_SIGNED_IN');

  const doFetch = (t: string) => fetch(`${FN_BASE}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${t}`,
      'apikey': SUPABASE_ANON,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  let res = await doFetch(token);
  if (res.status === 401) {
    const { data } = await supabase.auth.refreshSession();
    token = data.session?.access_token;
    if (!token) throw new Error('NOT_SIGNED_IN');
    res = await doFetch(token);
  }
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

export function useProfileScreen() {
  const { authReady, session, user } = useAuth();
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: any }>({ loading: true });

  const load = useCallback(async () => {
    if (!authReady) {
      setState(s => ({ ...s, loading: true }));
      return;
    }

    if (!session || !user) {
      setState({ loading: false, error: 'NOT_SIGNED_IN' });
      return;
    }

    try {
      setState(s => ({ ...s, loading: true, error: undefined }));

      const [me, wallet, refs, broker, prefs] = await Promise.all([
        authFetch('/profile/me', session),
        authFetch('/wallet/balance', session).catch(() => ({ balance: 0, totalProfit: 0, totalDeducted: 0 })),
        authFetch('/referral/my', session).catch(() => ({ referrals: [], earnings: {} })),
        authFetch('/broker/oauth/status', session).catch(() => ({ connected: false })),
        supabase.from('notification_preferences').select('*').eq('user_id', user.id).maybeSingle()
          .then(r => r.data || { email_enabled: false, push_enabled: true, sms_enabled: false, whatsapp_enabled: false, trade_alerts: true }),
      ]);

      setState({
        loading: false,
        data: {
          profile: me.profile,
          referralCode: me.referralCode,
          earnings: me.earnings,
          wallet,
          referrals: refs.referrals,
          broker,
          prefs,
        },
      });
    } catch (e: any) {
      setState({ loading: false, error: e.message });
    }
  }, [authReady, session, user]);

  useEffect(() => { load(); }, [load]);
  return { ...state, refresh: load, authReady };
}
```

Use in the screen:
```tsx
const { authReady, loading, error, data, refresh } = useProfileScreen();

if (!authReady) return <FullScreenLoader text="Loading session..." />;
if (error === 'NOT_SIGNED_IN') return <LoginRequiredScreen />;
```
Never render the screen from a single `/profiles` table row — you WILL miss wallet balance, referral earnings, broker status, notification prefs. That is the exact bug you saw before.

---

## 11. Screen layout (match website exactly)

The screenshots the user shared show this order — replicate 1:1:

1. **Header card (gradient border cyan→purple)**
   - Circular avatar 88×88 + camera badge (tap → image picker → upload → PATCH `photo_url`).
   - Name (700, 22px), Beginner pill (if `earnings.successful_count < 5`).
   - `CLIENT ID` label + pill `ALG0001` + copy icon.
   - Email row (mail icon) + Phone row (phone icon).
   - `Profile Completion 80%` progress bar (value = `profile.profile_completion`).
   - Top-right `Edit` outline button → opens edit sheet (full_name, mobile, avatar).

2. **Email Signal & P&L Alerts card** (bell icon left, toggle right)
   - Subtitle chip `⚡ ₹5 / day`.
   - Body text (word-for-word from screenshot).
   - Toggle bound to `prefs.email_enabled` → upsert on change.

3. **4-tile stat row (2×2 on mobile, 1×4 on tablet)**
   - **WALLET** `₹{wallet.balance.toLocaleString('en-IN')}` — tap → Wallet screen.
   - **TOTAL P&L** `₹{wallet.totalProfit}` — green if >0.
   - **REFERRAL EARNINGS** `₹{earnings.total_earned}` + `{earnings.successful_count} successful` sub-label.
   - **PLAN** `Free` + `{broker.connected ? broker.broker : 'No broker'}` sub-label.

4. **Meta row** — 4 columns: `KYC` (pill amber/green), `ACCOUNT STATUS` (pill), `ROLE`, `JOINED` (format `dd/MM/yyyy` from `created_at`).

5. **Referral card** (own section below) — big code, share buttons WhatsApp / Telegram / Twitter / Facebook / Email, QR (`react-native-qrcode-svg`), share message identical to website.

6. **Broker card** — Dhan logo, status pill (Connected/Reconnect), `{days_left}d left`, Reconnect CTA opens `/broker/setup`.

7. **Security** — Change password, Biometric toggle.

8. **About** — Version, Terms, Privacy, Support, Logout (red, confirm modal).

---

## 12. Design tokens (dark theme, matches website)

```
bg          #0B1220
surface     #111827
border      rgba(255,255,255,0.08)
text        #E5E7EB
muted       #94A3B8
cyan        #22D3EE
purple      #8B5CF6
gold        #F4B400
green       #10B981
red         #EF4444
radius      16 (cards), 20 (hero card)
padding     20 card, 16 row gap
font        700 headings, 500 body, 400 caption
```

Hero card gradient border: `linear-gradient(90deg,#22D3EE 0%,#8B5CF6 100%)` — implement with `expo-linear-gradient` wrapping a solid inner `View`.

---

## 13. Common failure modes (fix these BEFORE shipping)

| Symptom | Cause | Fix |
|---|---|---|
| Empty name / avatar | reading `profile.name` / `profile.avatar_url` | Field is `full_name` / `photo_url` |
| Wallet shows 0 | reading it from `profiles` | Call `/wallet/balance` |
| Referral earnings 0 but website shows real number | reading `profile.referral_earnings` | Use `earnings.total_earned` from `/profile/me` |
| 401 on every call | missing `apikey` header | Both `Authorization` AND `apikey` required |
| Repeated `NOT_SIGNED_IN` on app open | APIs run before Supabase restores AsyncStorage session | Gate calls behind `authReady && session`; remove storage timeout fallback |
| `[Auth] Storage timeout - continuing with null values` | Broken custom storage wrapper returns null too early | Use direct `@react-native-async-storage/async-storage` in Supabase client |
| PATCH returns 400 | sending `email` or `client_id` | Only send full_name / mobile / photo_url |
| Profile blank after signup | row not created yet | `/profile/me` auto-backfills; just call it once |
| Toggle flips back | writing wrong columns | Table is `notification_preferences`, PK = `user_id` |

---

## 14. Acceptance test (do all 7 before saying done)

1. Fresh install → login → Profile shows name, ALG code, email, phone, avatar, 80% bar.
2. Wallet tile shows same rupee amount as website.
3. Referral tile shows same "successful" count as website.
4. Tap avatar → pick photo → uploads → new URL persists after app kill.
5. Edit name/mobile → save → PATCH 200 → reload shows new values.
6. Toggle Email alerts → row upserted in `notification_preferences`.
7. Logout → session cleared → redirected to login.

Do not mark the task complete until all 7 pass on a real device.
