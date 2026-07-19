# IndexPilot AI — React Native App
## FULL LINE-BY-LINE PROMPT (Auto-Symbol Slots + Profile)
### For Google Gemini / Blackbox / Cursor / VS Code AI

> Paste this ENTIRE file into the AI. Every URL, header, payload, DB table, column, UI rule, and error case is production-correct for the live IndexPilot backend. The RN app must behave IDENTICALLY to the website — same enable/disable, same save, same paid-slot purchase, same profile fields. If the website shows a slot as ENABLED, the RN app must show it as ENABLED (and vice-versa) because they share ONE backend row.

---

## 0. Constants (use exactly)

```
SUPABASE_URL          = https://oklgqelcaujxntgjyuis.supabase.co
SUPABASE_ANON_KEY     = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rbGdxZWxjYXVqeG50Z2p5dWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MTA0NjUsImV4cCI6MjA3NTA4NjQ2NX0.FnFcNQXGXGpsQXvR4TW1LDc23FlIBBglLhZsRdn9VV0
FUNCTIONS_BASE        = https://oklgqelcaujxntgjyuis.supabase.co/functions/v1
SERVER_BASE           = https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7
```

Every request MUST include:
```
Authorization: Bearer <supabase user access_token from supabase.auth.getSession()>
apikey:        <SUPABASE_ANON_KEY>
Content-Type:  application/json
```

Never send `service_role` key from the app. Never bundle Firebase service account.

**Critical RN auth rule:** do not call any profile, wallet, referral, broker, slot, or notification API until Supabase auth hydration is complete. The AuthContext must expose `authReady`; screens must wait for `authReady === true && session`. If your logs show `[Auth] Storage timeout - continuing with null values`, delete that custom storage timeout wrapper and use direct `@react-native-async-storage/async-storage` in `createClient()`.

---

# PART A — AUTO-SYMBOL SLOTS (enable / disable / save / buy paid slot)

## A1. Why the current RN app is broken

Right now the RN app toggles `enabled` and either:
1. Writes directly to the Supabase table `user_symbol_config` (skips validation, breaks RLS silently), OR
2. POSTs only `{ slot, enabled }` — the backend validator `normalizeAutoSymbolSlot` REJECTS this because `index_name`, `moneyness`, `lot_count` are required.

That's why the website shows ENABLED but the app shows DISABLED (or the reverse) — the toggle never reaches the DB.

**FIX (mandatory):** the RN app MUST send the **complete slot object** (all 10 fields) to the REST endpoint below, exactly the same payload the website sends. Do NOT write to the table directly.

## A2. Backend table (read-only reference)

Table: `public.user_symbol_config` (unique key `(user_id, slot)`)

| Column                          | Type    | Notes                                        |
|---------------------------------|---------|----------------------------------------------|
| user_id                         | uuid    | auth.uid()                                   |
| slot                            | int     | 1..max_slots (3 free + purchased)            |
| index_name                      | text    | `NIFTY` \| `BANKNIFTY` \| `SENSEX`           |
| moneyness                       | text    | `ATM` \| `ITM1` \| `ITM2` \| `OTM1` \| `OTM2`|
| lot_count                       | int     | 1..50                                        |
| enabled                         | bool    | THE TOGGLE                                   |
| target_per_lot                  | numeric | default 6000                                 |
| stop_loss_per_lot               | numeric | default 3000                                 |
| trailing_enabled                | bool    | default true                                 |
| trailing_activation_per_lot     | numeric | default round(target*0.66)                   |
| trailing_step_per_lot           | numeric | default round(sl*0.33)                       |

## A3. API endpoints (identical for RN and web)

### A3.1 List all slots + quota
`GET  {SERVER_BASE}/auto-symbol/config`

Response:
```json
{
  "success": true,
  "slots": [
    { "slot":1, "index_name":"NIFTY", "moneyness":"ATM", "lot_count":1,
      "enabled":true, "target_per_lot":6000, "stop_loss_per_lot":3000,
      "trailing_enabled":true, "trailing_activation_per_lot":4000,
      "trailing_step_per_lot":1000 }
  ],
  "max_slots": 3,
  "free_slots": 3,
  "extra_slots": 0,
  "slot_price": 49,
  "hard_cap": 20
}
```

### A3.2 Save / update / toggle ONE slot  **(this is the enable/disable endpoint)**
`POST {SERVER_BASE}/auto-symbol/config`

**Body — send ALL 10 fields even when only toggling `enabled`:**
```json
{
  "slot": 1,
  "index_name": "NIFTY",
  "moneyness": "ATM",
  "lot_count": 1,
  "enabled": false,
  "target_per_lot": 6000,
  "stop_loss_per_lot": 3000,
  "trailing_enabled": true,
  "trailing_activation_per_lot": 4000,
  "trailing_step_per_lot": 1000
}
```
Response `{ "success": true, "slot": { ...saved row... } }`.

If you send a partial body (only `slot` + `enabled`), the server returns 500 with `"Index must be NIFTY, BANKNIFTY, or SENSEX"`. That's the bug you're hitting.

### A3.3 Delete a slot
`DELETE {SERVER_BASE}/auto-symbol/config/:slot` → `{ "success": true }`

### A3.4 Buy an extra paid slot (₹49, wallet-debit)
`POST {SERVER_BASE}/auto-symbol/purchase-slot`  (empty body)

Success: `{ "success":true, "new_slot":4, "wallet_balance": 1191.00, "extra_slots":1 }`
402 insufficient: `{ "success":false, "error":"Insufficient wallet balance...", "need_recharge":true, "required":49, "balance":12.5 }`
400 cap: `{ "success":false, "error":"Maximum 20 slots reached" }`

### A3.5 Resolve live tradable symbol (preview only, not required for save)
`POST {SERVER_BASE}/auto-symbol/resolve`
Body: `{ "slot": 1 }` → returns broker `security_id`, `tradingsymbol`, `strike`, `option_type`.

## A4. RN implementation (drop-in)

```ts
// src/api/autoSymbol.ts
import { supabase } from '../lib/supabase';
const SERVER = 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7';
const ANON   = 'eyJhbGciOi...ANON_KEY...';

async function authHeaders() {
  const { data:{ session } } = await supabase.auth.getSession();
  if (!session) throw new Error('NOT_SIGNED_IN');
  return {
    Authorization: `Bearer ${session.access_token}`,
    apikey: ANON,
    'Content-Type': 'application/json',
  };
}

export async function listSlots() {
  const r = await fetch(`${SERVER}/auto-symbol/config`, { headers: await authHeaders() });
  return r.json();
}

// ⚠️ MUST send full slot object — even for a simple toggle.
export async function saveSlot(slot) {
  const r = await fetch(`${SERVER}/auto-symbol/config`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(slot),
  });
  const j = await r.json();
  if (!j.success) throw new Error(j.error || 'Save failed');
  return j.slot;
}

export async function deleteSlot(n) {
  const r = await fetch(`${SERVER}/auto-symbol/config/${n}`, {
    method: 'DELETE', headers: await authHeaders(),
  });
  return r.json();
}

export async function buyExtraSlot() {
  const r = await fetch(`${SERVER}/auto-symbol/purchase-slot`, {
    method: 'POST', headers: await authHeaders(),
  });
  return r.json();  // handle 402 need_recharge
}
```

## A5. RN toggle handler — the ONLY correct pattern

```tsx
async function onToggleEnabled(slot, next) {
  if (!authReady || !session) return;

  // Optimistic UI
  setSlots(prev => prev.map(s => s.slot === slot.slot ? { ...s, enabled: next } : s));
  try {
    // Send the WHOLE slot with the new enabled flag.
    await saveSlot({ ...slot, enabled: next });
    // Re-fetch to guarantee parity with website.
    const j = await listSlots();
    setSlots(j.slots);
  } catch (e) {
    // Rollback
    setSlots(prev => prev.map(s => s.slot === slot.slot ? { ...s, enabled: !next } : s));
    Alert.alert('Save failed', e.message);
  }
}
```

## A6. RN UI spec (must mirror website)

- Card list, one card per slot, header shows `Slot N` badge + index name + moneyness.
- Right side of header: `Switch` bound to `slot.enabled` → calls `onToggleEnabled`.
- Body fields: Index picker, Moneyness picker, Lot count stepper, Target/lot, SL/lot, Trailing switch, Trailing activation/lot, Trailing step/lot.
- Live "Effective per trade" calculation using multipliers (KEEP IN SYNC WITH WEBSITE):
  ```
  ITM2 tgt=0.70 sl=1.30 · ITM1 0.85/1.15 · ATM 1.0/1.0 · OTM1 1.20/0.85 · OTM2 1.50/0.70
  effective_target   = target_per_lot   * lot_count * mm.tgt
  effective_stopLoss = stop_loss_per_lot* lot_count * mm.sl
  ```
- Footer of card: **Save Slot N** button (calls `saveSlot(currentSlot)`).
- Below list: **Add Symbol (slot N of maxSlots)** button — disabled if `slots.length >= max_slots`.
- Yellow banner when `max_slots < hard_cap`: "You have {max_slots} slots ({free_slots} free + {extra_slots} paid). Unlock slot {max_slots+1} for ₹{slot_price} — debited from wallet." with **Buy Slot ₹49** button → `buyExtraSlot()`, on 402 show toast "Recharge wallet".
- After `buyExtraSlot` success: call `listSlots()` to refresh quota, then `saveSlot({...defaults, slot:new_slot, index_name:"NIFTY", moneyness:"ATM"})` so the new slot appears immediately (same behavior as website).

## A7. Pull-to-refresh + realtime parity

Add a realtime subscription so RN reflects website edits within ~1 second:

```ts
useEffect(() => {
  const ch = supabase.channel(`user_symbol_config:${userId}`)
    .on('postgres_changes',
        { event:'*', schema:'public', table:'user_symbol_config', filter:`user_id=eq.${userId}` },
        () => refreshSlots())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}, [userId]);
```

## A8. Common failure matrix (DEBUG THIS FIRST)

| Symptom in RN                             | Root cause                                      | Fix                                          |
|-------------------------------------------|-------------------------------------------------|----------------------------------------------|
| Toggle flips then reverts                 | Only `{slot,enabled}` sent → 500 from server    | Send full slot object (A5)                   |
| Website shows enabled, app shows disabled | RN reading from stale local cache               | Call `listSlots()` on focus + realtime (A7)  |
| `Index must be NIFTY, BANKNIFTY, or SENSEX` | Missing index_name in body                    | Include `index_name` in every save           |
| 401 Unauthorized                          | Missing `Authorization` header                  | Use `authHeaders()` in EVERY call            |
| Repeated `NOT_SIGNED_IN` on Profile open  | API calls run before Supabase restores session  | Gate all calls behind `authReady && session` |
| `[Auth] Storage timeout - continuing with null values` | Broken custom storage timeout returns null | Use direct AsyncStorage in Supabase client   |
| 402 need_recharge on Buy Slot             | Wallet < ₹49                                   | Route to Wallet → Recharge                   |
| Slot appears saved but engine skips it    | `enabled:false` OR no live symbol for that index| Check `enabled=true`; server auto-resolves    |

## A9. Manual test script (run once, must all pass)

1. Login on RN.
2. `GET /auto-symbol/config` → shows 3 free slots, `max_slots:3`.
3. Toggle Slot 1 off in RN → open website → Slot 1 shows OFF within 1s.
4. Toggle Slot 1 on from website → RN shows ON within 1s (realtime).
5. Change Slot 2 lot_count from 1 → 2 in RN → tap Save → website shows 2 lots after refresh.
6. Buy Slot 4 in RN with wallet ≥ ₹49 → Slot 4 card appears, wallet debited ₹49, `wallet_transactions` row `type=debit` created.
7. Delete Slot 4 in RN → row removed both sides.

---

# PART B — PROFILE SCREEN (identical to website)

## B1. Table: `public.profiles` (23 columns)

```
user_id, client_id, full_name, email, mobile, avatar_url,
address, city, state, pincode, country,
pan, aadhaar_masked, date_of_birth, occupation,
signup_bonus_credited, signup_bonus_amount, signup_bonus_remaining, signup_bonus_expires_at,
referred_by, kyc_status, created_at, updated_at
```

Editable client-side: `full_name, mobile, avatar_url, address, city, state, pincode, date_of_birth, occupation`.
Read-only: `client_id, email, kyc_status, pan, signup_bonus_*`.

## B2. Endpoints

| Purpose             | Method | URL / call                                                                 |
|---------------------|--------|----------------------------------------------------------------------------|
| Get profile         | GET    | `supabase.from('profiles').select('*').eq('user_id',uid).single()`         |
| Update profile      | PATCH  | `supabase.from('profiles').update(patch).eq('user_id',uid)`                |
| Wallet balance      | GET    | `supabase.from('kv_store_c4d79cb7').select('value').eq('key',\`wallet:${uid}\`).maybeSingle()` → `{balance,totalProfit,totalDeducted,lastUpdated}` |
| Wallet transactions | GET    | `supabase.from('wallet_transactions').select('*').eq('user_id',uid).order('created_at',{ascending:false}).range(p*20,p*20+19)` |
| Referral code       | GET    | `supabase.from('referral_codes').select('code').eq('user_id',uid).single()`|
| Referral earnings   | GET    | `supabase.from('referral_earnings').select('*').eq('user_id',uid).single()`|
| Referred users      | GET    | `supabase.from('referrals').select('*').eq('referrer_user_id',uid)`        |
| Notification prefs  | GET/UPSERT | `supabase.from('notification_preferences').upsert({user_id,...})`      |
| Broker (masked)     | GET    | `supabase.from('broker_credentials').select('broker,auth_method,dhan_client_id,dhan_client_name,given_power_of_attorney,access_token_expiry,api_key_expiry,last_status,last_error,updated_at').eq('user_id',uid).maybeSingle()` |
| Change password     | POST   | `supabase.auth.updateUser({ password })`                                   |
| Register FCM token  | POST   | `{FUNCTIONS_BASE}/push-subscribe` body `{token,platform,deviceId}`         |
| Notification history| GET    | `{SERVER_BASE}/user/notifications` (poll 5–10s)                            |
| Logout              | -      | `supabase.auth.signOut()`                                                  |

## B3. Avatar upload (bucket `avatars`, public)
```ts
const path = `${uid}/${Date.now()}.jpg`;
await supabase.storage.from('avatars').upload(path, file, { contentType:'image/jpeg', upsert:true });
const { data } = supabase.storage.from('avatars').getPublicUrl(path);
await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('user_id', uid);
```

## B4. UI (single scroll — must match website order)

1. **Header card** — round avatar (tap to change), name, `ALG0042` pill, verified badge when `kyc_status='verified'`, edit icon top-right.
2. **Wallet card** — big balance `₹1,240.50`, chips `Bonus ₹40 left · expires in 3d`, buttons `Recharge` / `History`.
3. **Auto-Symbol Slots** — full component from PART A (mount here so users manage from Profile too).
4. **Personal info** — email (RO), mobile, address, city/state/pincode, DOB, occupation. Inline edit modal → PATCH profiles.
5. **Referral card** — code `ALG0042`, `Total earned ₹2,150 · 12 friends`. Native Share sheet → `https://indexpilotai.com/signup?ref=<code>`.
6. **Broker connection** — Dhan logo, status pill (Connected if `access_token_expiry > now()` else Reconnect), expiry countdown, Reconnect button.
7. **Notifications** — toggle rows Email (`₹5/day` sublabel), Push, SMS, WhatsApp, Trade alerts → UPSERT notification_preferences.
8. **Security** — Change password, 2FA, biometric unlock toggle.
9. **About** — App version, Terms, Privacy, Support (opens ticket), Logout (red, confirm modal).

## B5. Non-negotiables

- AuthContext must expose `authReady`; Profile screen must render a session loader until `authReady === true`. Do not start React Query hooks with `enabled:true` before a session exists.
- React Query with `staleTime: 30_000` keyed by `user.id` for every fetch.
- Pull-to-refresh at screen root re-fetches all hooks in parallel.
- Optimistic updates on toggles + rollback on error (see A5 pattern).
- 401 → `supabase.auth.refreshSession()` once → if still 401 redirect `/login`.
- Every destructive action requires a confirm modal.
- Accessibility: min 44×44 tap targets, `accessibilityLabel` on every icon.
- Dark theme tokens: bg `#0B1220`, surface `#111827`, border `#1F2937`, accent cyan `#22D3EE` → purple `#8B5CF6`, gold `#F4B400`. Rounded-2xl cards, 16-24 px padding.

---

# PART C — DELIVERABLES CHECKLIST FOR THE RN AI

- [ ] `src/api/autoSymbol.ts` — 4 functions in A4.
- [ ] `src/api/profile.ts` — thin wrappers for B2.
- [ ] `components/profile/AutoSymbolSlots.tsx` — full card list, toggles use A5 pattern, realtime A7.
- [ ] `components/profile/WalletCard.tsx`, `PersonalInfo.tsx`, `ReferralCard.tsx`, `BrokerCard.tsx`, `NotificationsCard.tsx`, `SecurityCard.tsx`, `AboutCard.tsx`.
- [ ] `app/(tabs)/profile.tsx` — mounts all cards in B4 order, pull-to-refresh at root.
- [ ] Push notifications wired per `docs/RN_PUSH_NOTIFICATION_FULL_PROMPT.md`.
- [ ] Manual test A9 passes 7/7.

**Acceptance test:** open website + RN side-by-side. Toggling any slot on either side must update the other within 1 second, and the value must persist across app restart. If it doesn't, PART A is wrong — re-read A1, A2, A5.

---

**END OF PROMPT — paste into Gemini / Blackbox / Cursor. Every URL, header, column, and payload above is production-correct for IndexPilot backend on `oklgqelcaujxntgjyuis.supabase.co`.**
