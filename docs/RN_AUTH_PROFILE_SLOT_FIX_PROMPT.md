# RN FIX PROMPT — Profile + Slots `NOT_SIGNED_IN` / Storage Timeout

Paste this whole prompt into Blackbox / Cursor / Gemini for the React Native app.

## The real issue

The backend endpoints are correct. The RN app is calling profile, wallet, referral, broker and slot APIs **before Supabase has finished loading the saved session from AsyncStorage**.

Your logs prove it:

```txt
[ProfileScreen] wallet/balance failed: NOT_SIGNED_IN
[useProfileData] /profile/me failed: NOT_SIGNED_IN
[Auth] Storage timeout - continuing with null values
```

That means the app treats the user as signed out while AsyncStorage is still hydrating. Do **not** retry endpoints in a loop. Fix auth hydration first.

---

## 1. Replace `src/lib/supabase.ts` completely

Use direct AsyncStorage. Do not wrap `getItem()` in a timeout that returns null.

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

// Required for React Native token refresh while app is foregrounded.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
```

**Remove any custom storage wrapper that logs:**

```txt
[Auth] Storage timeout - continuing with null values
```

Returning `null` from storage during timeout destroys auth boot logic.

---

## 2. Replace `src/contexts/AuthContext.tsx` completely

The app must expose `authReady`. Screens must not call protected APIs until `authReady === true` and `session` exists.

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
        // Wait for AsyncStorage hydration. Do NOT use timeout fallback to null.
        const { data, error } = await supabase.auth.getSession();
        if (error) console.warn('[Auth] getSession failed:', error.message);
        if (!alive) return;
        setSession(data.session ?? null);
      } finally {
        if (alive) setAuthReady(true);
      }
    }

    boot();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setAuthReady(true);
    });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
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

## 3. Replace protected API helper in `src/lib/api.ts`

All edge-function requests must use the current session from `AuthContext`; do not call when session is missing.

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

export async function request<T>(path: string, session: Session | null, init: RequestInit = {}): Promise<T> {
  let activeSession = session;

  if (!activeSession?.access_token) {
    const { data } = await supabase.auth.getSession();
    activeSession = data.session;
  }

  if (!activeSession?.access_token) throw new NotSignedInError();

  async function doFetch(token: string) {
    return fetch(`${SERVER_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
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
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg = data?.error || data?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data as T;
}
```

---

## 4. Fix profile data hook — never fetch until auth is ready

```ts
// src/hooks/useProfileData.ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { request, NotSignedInError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

const DEFAULT_PREFS = {
  email_enabled: false,
  push_enabled: true,
  sms_enabled: false,
  whatsapp_enabled: false,
  trade_alerts: true,
};

export function useProfileData() {
  const { authReady, session, user } = useAuth();
  const [state, setState] = useState<any>({ loading: true, data: null, error: null });

  const load = useCallback(async () => {
    if (!authReady) {
      setState((s: any) => ({ ...s, loading: true }));
      return;
    }

    if (!session || !user) {
      setState({ loading: false, data: null, error: 'NOT_SIGNED_IN' });
      return;
    }

    setState((s: any) => ({ ...s, loading: true, error: null }));

    try {
      const [me, wallet, refs, broker, prefs] = await Promise.all([
        request('/profile/me', session),
        request('/wallet/balance', session).catch((e) => {
          if (!(e instanceof NotSignedInError)) console.warn('[ProfileScreen] wallet/balance failed:', e);
          return { balance: 0, totalProfit: 0, totalDeducted: 0 };
        }),
        request('/referral/my', session).catch((e) => {
          if (!(e instanceof NotSignedInError)) console.warn('[ProfileScreen] referral/my failed:', e);
          return { referrals: [], earnings: {} };
        }),
        request('/broker/oauth/status', session).catch((e) => {
          // This is not fatal. If Dhan is not connected, show Reconnect.
          const msg = String(e?.message || e);
          if (!msg.includes('No access token saved')) console.warn('[ProfileScreen] broker/oauth/status failed:', e);
          return { connected: false, broker: 'dhan', days_left: 0 };
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
          referralCode: me.referralCode,
          earnings: me.earnings,
          wallet,
          referrals: refs.referrals || [],
          broker,
          prefs,
        },
      });
    } catch (e: any) {
      setState({ loading: false, data: null, error: e.message || 'PROFILE_LOAD_FAILED' });
    }
  }, [authReady, session, user]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, refresh: load, authReady };
}
```

Screen usage:

```tsx
const { authReady, loading, error, data, refresh } = useProfileData();

if (!authReady) return <FullScreenLoader text="Loading session..." />;
if (error === 'NOT_SIGNED_IN') return <LoginRequiredScreen />;
if (loading) return <ProfileSkeleton />;
```

---

## 5. Fix slot API — pass session, do not call before auth ready

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

export function listSlots(session: Session) {
  return request('/auto-symbol/config', session);
}

// Must send complete slot object, even for enable/disable.
export function saveSlot(session: Session, slot: AutoSlot) {
  return request('/auto-symbol/config', session, {
    method: 'POST',
    body: JSON.stringify(slot),
  });
}

export function buyExtraSlot(session: Session) {
  return request('/auto-symbol/purchase-slot', session, { method: 'POST' });
}
```

Correct toggle:

```tsx
async function onToggleEnabled(slot, next) {
  if (!authReady || !session) return;

  const fullSlot = {
    ...defaultSlot(slot.slot),
    ...slot,
    enabled: next,
  };

  setSlots((prev) => prev.map((s) => s.slot === slot.slot ? fullSlot : s));

  try {
    await saveSlot(session, fullSlot);
    const latest = await listSlots(session);
    setSlots(latest.slots || []);
  } catch (e: any) {
    setSlots((prev) => prev.map((s) => s.slot === slot.slot ? { ...slot, enabled: !next } : s));
    Alert.alert('Save failed', e.message);
  }
}
```

Correct buy slot:

```tsx
async function onBuySlot() {
  if (!authReady || !session) return;

  const result = await buyExtraSlot(session);

  if (result.need_recharge) {
    Alert.alert('Recharge required', result.error || 'Wallet balance is less than ₹49');
    return;
  }

  const newSlot = result.new_slot;
  await saveSlot(session, defaultSlot(newSlot));

  const latest = await listSlots(session);
  setSlots(latest.slots || []);
  setMaxSlots(latest.max_slots);
}
```

---

## 6. Login flow must wait for Supabase session

After login, do not navigate to Profile until `signInWithPassword` returns a session.

```ts
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) throw error;
if (!data.session) throw new Error('LOGIN_NO_SESSION');

// Optional: verify persisted session once before navigation.
const { data: again } = await supabase.auth.getSession();
if (!again.session) throw new Error('SESSION_NOT_PERSISTED');

router.replace('/(tabs)/profile');
```

---

## 7. Final acceptance test

1. Kill the app completely.
2. Open app while already logged in.
3. First screen shows `Loading session...`, **not** repeated `NOT_SIGNED_IN` warnings.
4. Profile loads `/profile/me`, `/wallet/balance`, `/referral/my`, `/broker/oauth/status` only after `authReady=true`.
5. If Dhan is not connected, broker card shows `Reconnect` and does not crash.
6. Toggle Slot 1 OFF → refresh → still OFF.
7. Toggle Slot 1 ON → refresh → still ON.
8. Buy Slot 4 → wallet debits ₹49 → Slot 4 appears with default full payload → toggle/save works.

If `[Auth] Storage timeout - continuing with null values` still appears, the app still has the old broken storage/AuthContext code somewhere. Search and delete that fallback.
