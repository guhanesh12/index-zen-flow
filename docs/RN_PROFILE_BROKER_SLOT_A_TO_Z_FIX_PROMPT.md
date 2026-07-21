# RN A-to-Z Fix Prompt — Profile, Broker Status, Slots, Wallet

Paste this whole prompt into Cursor / Blackbox / Gemini for the React Native app.

## What is broken and why

There are **two different tokens** in this app:

1. **Supabase access token** — proves the user is logged in. Used in `Authorization: Bearer <supabase_access_token>` for every backend call.
2. **Dhan access token** — proves the user's broker is connected. Stored only on the backend after Dhan OAuth/manual connection.

Your error:

```txt
Failed to check broker connection: No access token saved. Connect with Dhan first.
```

means the RN app is calling the **wrong broker API** for the Profile screen, probably:

```txt
POST /broker/oauth/verify
```

Do **not** call `/broker/oauth/verify` on profile load. That endpoint is only for a manual **Test Connection** button after the user has connected Dhan. It throws when no Dhan token is saved.

For the Profile broker card, call only:

```txt
GET /broker/oauth/status
```

If it returns no credentials, show **Not Connected / Reconnect**. Do not throw. Do not block the profile screen.

The Expo warning:

```txt
setBackgroundColorAsync is not supported with edge-to-edge enabled
```

is unrelated to profile APIs. Remove or guard that call on Android edge-to-edge builds; it is only a UI warning.

---

## 1. Backend base URL and headers

```ts
// src/lib/supabase.ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://oklgqelcaujxntgjyuis.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rbGdxZWxjYXVqeG50Z2p5dWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MTA0NjUsImV4cCI6MjA3NTA4NjQ2NX0.FnFcNQXGXGpsQXvR4TW1LDc23FlIBBglLhZsRdn9VV0';
export const SERVER_BASE = `${SUPABASE_URL}/functions/v1/make-server-c4d79cb7`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
```

**Important:** If your current `SUPABASE_ANON_KEY` is already correct, keep it. It must be the same anon key used by the web app.

Every edge-function request must send:

```txt
Authorization: Bearer <Supabase session access_token>
apikey: <SUPABASE_ANON_KEY>
Content-Type: application/json
```

Do **not** send a Dhan token in `Authorization`. The backend reads Dhan tokens from its database/KV.

---

## 2. Fix auth hydration first

Do not call profile/wallet/broker/slot APIs until Supabase finishes loading the saved session from AsyncStorage.

Remove any code that logs or behaves like:

```txt
Storage timeout - continuing with null values
```

That timeout returns `null` before Supabase finishes hydrating and causes false `NOT_SIGNED_IN` errors.

```tsx
// src/contexts/AuthContext.tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AuthContextValue = {
  authReady: boolean;
  session: Session | null;
  user: User | null;
  signedIn: boolean;
  refreshSession: () => Promise<Session | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let alive = true;

    async function boot() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.warn('[Auth] getSession failed:', error.message);
        if (!alive) return;
        setSession(data.session ?? null);
      } finally {
        if (alive) setAuthReady(true);
      }
    }

    boot();

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setAuthReady(true);
    });

    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const refreshSession = useCallback(async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      console.warn('[Auth] refreshSession failed:', error.message);
      setSession(null);
      return null;
    }
    setSession(data.session ?? null);
    return data.session ?? null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    authReady,
    session,
    user: session?.user ?? null,
    signedIn: !!session?.user,
    refreshSession,
    signOut,
  }), [authReady, session, refreshSession, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
```

---

## 3. Replace protected API helper

```ts
// src/lib/api.ts
import type { Session } from '@supabase/supabase-js';
import { SERVER_BASE, SUPABASE_ANON_KEY, supabase } from './supabase';

export class NotSignedInError extends Error {
  constructor() {
    super('NOT_SIGNED_IN');
    this.name = 'NotSignedInError';
  }
}

export type RequestOptions = RequestInit & {
  /** If true, return JSON even when HTTP status is non-2xx. Use only for intentionally optional calls. */
  allowHttpError?: boolean;
};

export async function request<T>(path: string, session: Session | null, init: RequestOptions = {}): Promise<T> {
  let activeSession = session;

  if (!activeSession?.access_token) {
    const { data } = await supabase.auth.getSession();
    activeSession = data.session;
  }

  if (!activeSession?.access_token) throw new NotSignedInError();

  const { allowHttpError, ...fetchInit } = init;

  async function doFetch(token: string) {
    return fetch(`${SERVER_BASE}${path}`, {
      ...fetchInit,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        ...(fetchInit.headers || {}),
      },
    });
  }

  let res = await doFetch(activeSession.access_token);

  if (res.status === 401) {
    const { data } = await supabase.auth.refreshSession();
    activeSession = data.session;
    if (!activeSession?.access_token) throw new NotSignedInError();
    res = await doFetch(activeSession.access_token);
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok && !allowHttpError) {
    const msg = data?.error || data?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data as T;
}
```

---

## 4. Correct profile APIs

Use these endpoints for Profile screen:

```txt
GET   /profile/me
PATCH /profile/me
GET   /wallet/balance
GET   /wallet/transactions
GET   /referral/my
GET   /broker/oauth/status     ✅ passive status, safe for Profile screen
```

Do **not** use these on Profile screen initial load:

```txt
POST /broker/oauth/verify      ❌ manual Test Connection only
POST /broker/oauth/generate-consent
POST /broker/oauth/consume
```

### `/profile/me` response

```json
{
  "profile": {
    "user_id": "uuid",
    "client_id": "ALG0001",
    "email": "user@example.com",
    "full_name": "User Name",
    "mobile": "9999999999",
    "photo_url": "https://...",
    "kyc_status": "pending",
    "account_status": "active",
    "role": "user",
    "broker_connected": false,
    "profile_completion": 80,
    "created_at": "2026-05-08T..."
  },
  "referralCode": "ALG0001",
  "earnings": {
    "total_earned": 0,
    "total_pending": 0,
    "successful_count": 0,
    "pending_count": 0
  }
}
```

Editable profile fields only:

```ts
PATCH /profile/me
body: { full_name?: string; mobile?: string; photo_url?: string }
```

Never edit `email`, `client_id`, `role`, `kyc_status`, `account_status` from the app UI.

---

## 5. Correct broker service

```ts
// src/api/broker.ts
import type { Session } from '@supabase/supabase-js';
import { request } from '../lib/api';

export type BrokerStatus = {
  connected: boolean;
  broker: 'dhan';
  clientId?: string | null;
  status: 'not_connected' | 'keys_saved' | 'connected' | 'token_invalid' | 'expired' | 'disconnected';
  expiresAt?: string | null;
  daysLeft: number;
  lastError?: string | null;
  liveOk?: boolean | null;
};

function diffDays(iso?: string | null) {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

export async function getBrokerStatus(session: Session | null): Promise<BrokerStatus> {
  // ✅ Passive status endpoint. This must not throw just because Dhan is not connected.
  const res: any = await request('/broker/oauth/status', session, { method: 'GET' });
  const c = res?.credentials;

  if (!c) {
    return {
      connected: false,
      broker: 'dhan',
      clientId: null,
      status: 'not_connected',
      expiresAt: null,
      daysLeft: 0,
      lastError: null,
      liveOk: null,
    };
  }

  const expiresAt = c.access_token_expiry || null;
  const expired = expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false;
  const status = expired ? 'expired' : (c.last_status || 'disconnected');
  const connected = status === 'connected' && !expired && res?.liveCheck?.ok !== false;

  return {
    connected,
    broker: 'dhan',
    clientId: c.dhan_client_id || null,
    status,
    expiresAt,
    daysLeft: diffDays(expiresAt),
    lastError: c.last_error || null,
    liveOk: res?.liveCheck?.ok ?? null,
  };
}

export async function verifyBrokerConnection(session: Session | null) {
  // Use only for a user-tapped "Test Connection" button.
  return request('/broker/oauth/verify', session, { method: 'POST' });
}
```

Profile UI rule:

```tsx
if (!broker.connected) {
  // Show Not Connected / Reconnect. Do not show a crash alert.
}
```

---

## 6. Correct profile hook

```ts
// src/hooks/useProfileScreen.ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { request, NotSignedInError } from '../lib/api';
import { getBrokerStatus } from '../api/broker';
import { useAuth } from '../contexts/AuthContext';

const DEFAULT_PREFS = {
  email_enabled: false,
  push_enabled: true,
  sms_enabled: false,
  whatsapp_enabled: false,
  trade_alerts: true,
};

export function useProfileScreen() {
  const { authReady, session, user } = useAuth();
  const [state, setState] = useState<any>({ loading: true, data: null, error: null });

  const load = useCallback(async () => {
    if (!authReady) {
      setState((s: any) => ({ ...s, loading: true, error: null }));
      return;
    }

    if (!session || !user) {
      setState({ loading: false, data: null, error: 'NOT_SIGNED_IN' });
      return;
    }

    setState((s: any) => ({ ...s, loading: true, error: null }));

    try {
      const [me, wallet, refs, broker, prefs] = await Promise.all([
        request<any>('/profile/me', session),
        request<any>('/wallet/balance', session).catch((e) => {
          if (!(e instanceof NotSignedInError)) console.warn('[ProfileScreen] wallet/balance failed:', e?.message || e);
          return { success: false, balance: 0, totalProfit: 0, totalDeducted: 0 };
        }),
        request<any>('/referral/my', session).catch((e) => {
          if (!(e instanceof NotSignedInError)) console.warn('[ProfileScreen] referral/my failed:', e?.message || e);
          return { referrals: [], earnings: { total_earned: 0, total_pending: 0, successful_count: 0, pending_count: 0 } };
        }),
        getBrokerStatus(session).catch((e) => {
          console.warn('[ProfileScreen] broker status non-fatal:', e?.message || e);
          return { connected: false, broker: 'dhan', status: 'not_connected', daysLeft: 0 };
        }),
        supabase.from('notification_preferences')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle()
          .then((r) => r.data || DEFAULT_PREFS)
          .catch(() => DEFAULT_PREFS),
      ]);

      setState({
        loading: false,
        error: null,
        data: {
          profile: me.profile,
          referralCode: me.referralCode || me.profile?.client_id,
          earnings: me.earnings || refs.earnings || { total_earned: 0, total_pending: 0, successful_count: 0, pending_count: 0 },
          wallet,
          referrals: refs.referrals || [],
          broker,
          prefs,
        },
      });
    } catch (e: any) {
      setState({ loading: false, data: null, error: e?.message || 'PROFILE_LOAD_FAILED' });
    }
  }, [authReady, session, user]);

  useEffect(() => { load(); }, [load]);

  return { ...state, authReady, refresh: load };
}
```

Screen usage:

```tsx
const { authReady, loading, error, data, refresh } = useProfileScreen();

if (!authReady) return <FullScreenLoader text="Loading session..." />;
if (error === 'NOT_SIGNED_IN') return <LoginRequiredScreen />;
if (loading) return <ProfileSkeleton />;
if (error) return <ErrorState message={error} onRetry={refresh} />;

const { profile, referralCode, earnings, wallet, broker, prefs } = data;
```

---

## 7. Notification preferences toggle

```ts
async function updateNotificationPrefs(userId: string, patch: Partial<typeof DEFAULT_PREFS>) {
  const row = { user_id: userId, ...DEFAULT_PREFS, ...patch };
  const { error } = await supabase.from('notification_preferences').upsert(row, { onConflict: 'user_id' });
  if (error) throw error;
  return row;
}
```

---

## 8. Avatar upload

```ts
async function uploadAvatar(userId: string, fileUri: string) {
  const path = `${userId}/${Date.now()}.jpg`;

  const file = {
    uri: fileUri,
    type: 'image/jpeg',
    name: 'avatar.jpg',
  } as any;

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: 'image/jpeg' });

  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

async function saveAvatar(session, userId: string, fileUri: string) {
  const photo_url = await uploadAvatar(userId, fileUri);
  return request('/profile/me', session, {
    method: 'PATCH',
    body: JSON.stringify({ photo_url }),
  });
}
```

---

## 9. Correct slots API

Free slots: `1, 2, 3`.

Paid slots: buy one extra slot for `₹49` using wallet.

Endpoints:

```txt
GET    /auto-symbol/config
POST   /auto-symbol/config
DELETE /auto-symbol/config/:slot
POST   /auto-symbol/purchase-slot
```

`POST /auto-symbol/config` must receive the **full slot object**, even when only toggling ON/OFF.

```ts
// src/api/autoSymbol.ts
import type { Session } from '@supabase/supabase-js';
import { request } from '../lib/api';

export type AutoSlot = {
  slot: number;
  index_name: 'NIFTY' | 'BANKNIFTY' | 'SENSEX';
  moneyness: 'ATM' | 'ITM1' | 'ITM2' | 'OTM1' | 'OTM2';
  lot_count: number;
  enabled: boolean;
  target_per_lot: number;
  stop_loss_per_lot: number;
  trailing_enabled: boolean;
  trailing_activation_per_lot: number;
  trailing_step_per_lot: number;
};

export const defaultSlot = (slot: number): AutoSlot => ({
  slot,
  index_name: 'NIFTY',
  moneyness: 'ATM',
  lot_count: 1,
  enabled: false,
  target_per_lot: 6000,
  stop_loss_per_lot: 3000,
  trailing_enabled: true,
  trailing_activation_per_lot: 4000,
  trailing_step_per_lot: 1000,
});

export async function listSlots(session: Session | null) {
  return request<any>('/auto-symbol/config', session);
}

export async function saveSlot(session: Session | null, slot: AutoSlot) {
  return request<any>('/auto-symbol/config', session, {
    method: 'POST',
    body: JSON.stringify(slot),
  });
}

export async function buyExtraSlot(session: Session | null) {
  return request<any>('/auto-symbol/purchase-slot', session, {
    method: 'POST',
    allowHttpError: true,
  });
}
```

Correct toggle:

```tsx
async function onToggleEnabled(slot: AutoSlot, enabled: boolean) {
  if (!authReady || !session) return;

  const previous = slot;
  const fullSlot = { ...defaultSlot(slot.slot), ...slot, enabled };

  setSlots((prev) => prev.map((s) => s.slot === slot.slot ? fullSlot : s));

  try {
    await saveSlot(session, fullSlot);
    const latest = await listSlots(session);
    setSlots(latest.slots || []);
    setMaxSlots(latest.max_slots || 3);
  } catch (e: any) {
    setSlots((prev) => prev.map((s) => s.slot === slot.slot ? previous : s));
    Alert.alert('Save failed', e.message || 'Slot could not be saved');
  }
}
```

Correct buy slot:

```tsx
async function onBuySlot() {
  if (!authReady || !session) return;

  const result = await buyExtraSlot(session);

  if (!result.success) {
    if (result.need_recharge) {
      Alert.alert('Recharge required', result.error || 'Wallet balance is less than ₹49');
      return;
    }
    Alert.alert('Purchase failed', result.error || 'Could not buy slot');
    return;
  }

  const newSlotNumber = result.new_slot;
  await saveSlot(session, defaultSlot(newSlotNumber));

  const latest = await listSlots(session);
  setSlots(latest.slots || []);
  setMaxSlots(latest.max_slots || result.max_slots || 3);
  setWalletBalance(result.wallet_balance);
}
```

---

## 10. Profile UI required mapping

Use exact backend fields:

```tsx
const name = profile.full_name || 'User';
const avatar = profile.photo_url;
const clientId = profile.client_id || referralCode;
const email = profile.email;
const mobile = profile.mobile || 'Not added';
const completion = Number(profile.profile_completion || 0);
const walletBalance = Number(wallet.balance || 0);
const totalPnl = Number(wallet.totalProfit || 0);
const referralEarned = Number(earnings.total_earned || 0);
const successfulRefs = Number(earnings.successful_count || 0);
const brokerLabel = broker.connected ? 'Connected' : 'Not Connected';
```

Never use these wrong fields:

```txt
profile.name          ❌ use profile.full_name
profile.avatar_url    ❌ use profile.photo_url
profile.referral_code ❌ use referralCode or profile.client_id
profile.wallet        ❌ use GET /wallet/balance
profile.broker        ❌ use GET /broker/oauth/status
```

---

## 11. Fix Expo edge-to-edge warning

Search for:

```ts
NavigationBar.setBackgroundColorAsync(...)
```

If edge-to-edge is enabled, remove it or guard it:

```ts
import { Platform } from 'react-native';

if (Platform.OS === 'android' && !EDGE_TO_EDGE_ENABLED) {
  await NavigationBar.setBackgroundColorAsync('#0B1220');
}
```

This warning does not break profile data.

---

## 12. Final checklist

1. Kill app completely and reopen.
2. App shows `Loading session...` until `authReady === true`.
3. No API calls happen before `authReady && session`.
4. Profile calls `GET /profile/me` and shows `full_name`, `photo_url`, `client_id`, `email`, `mobile`.
5. Wallet calls `GET /wallet/balance` and shows balance.
6. Referral calls `GET /referral/my` and shows earnings/success count.
7. Broker card calls only `GET /broker/oauth/status`; if no Dhan token exists, show `Not Connected`, not error alert.
8. `POST /broker/oauth/verify` is called only when user taps **Test Connection**.
9. Slot toggle sends full slot object to `POST /auto-symbol/config`.
10. Buy Slot sends `POST /auto-symbol/purchase-slot`, then creates default config for returned `new_slot`.
11. Refresh app: profile, broker status, slots and wallet still persist.

If the error `No access token saved. Connect with Dhan first.` still appears during Profile load, search the RN code for `/broker/oauth/verify` and remove that call from initial load.