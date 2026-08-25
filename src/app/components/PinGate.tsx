// @ts-nocheck
/**
 * PinGate — 4-digit PIN security layer for the web app.
 *
 * Screens (all in this one component):
 *   1. create  — no PIN in DB → user must set one (PIN + confirm)
 *   2. enter   — PIN exists → user must unlock
 *   3. forgot  — send OTP to registered mobile + email
 *   4. reset   — enter OTP + new PIN
 *
 * Backend: supabase/functions/user-pin  (status | set | verify | forgot | reset)
 * Re-locks after 2 minutes of the tab being hidden.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/utils-ext/supabase/client';
import { publicAnonKey } from '@/utils-ext/supabase/info';
import { SessionManager } from '@/utils-ext/security/SecurityHardening';

import { Loader2, Lock, ShieldCheck, KeyRound, ArrowLeft } from 'lucide-react';

const BASE = 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/user-pin';
const UNLOCK_KEY = 'ip_pin_unlocked_at';
const RELOCK_MS = 2 * 60 * 1000;

async function getFreshToken(forceRefresh = false): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const expSec = Number(session?.expires_at || 0);
  const expiringSoon = expSec > 0 && expSec * 1000 - Date.now() < 120_000;
  if (!session?.access_token || forceRefresh || expiringSoon) {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data?.session?.access_token) return data.session.access_token;
    return session?.access_token || null;
  }
  return session.access_token;
}

async function pinCall(path: string, method: 'GET' | 'POST', body?: any) {
  const doFetch = async (token: string) =>
    fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: publicAnonKey,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  let token = await getFreshToken();
  if (!token) throw new Error('SESSION_LOST');

  let res = await doFetch(token);
  // Expired / rotated JWT → refresh once and retry. IMPORTANT: only retry when the
  // 401 is a real auth failure, never for "Incorrect PIN"/"Incorrect OTP" — retrying
  // those would double-count failed attempts and lock users out early.
  if (res.status === 401) {
    const j: any = await res.json().catch(() => ({}));
    // A wrong PIN/OTP from our own function must NOT be retried (it would burn two
    // attempts). Anything else (gateway "Invalid JWT", expired/rotated token, empty
    // body) is a token problem → refresh once and retry.
    const isCredentialFailure =
      typeof j?.attemptsLeft === 'number' ||
      /incorrect (pin|otp)/i.test(String(j?.message || ''));
    if (isCredentialFailure) return { status: 401, ...j };

    const refreshed = await getFreshToken(true);
    if (!refreshed) throw new Error('SESSION_LOST');
    res = await doFetch(refreshed);
    if (res.status === 401) {
      const j2: any = await res.json().catch(() => ({}));
      const cred2 =
        typeof j2?.attemptsLeft === 'number' ||
        /incorrect (pin|otp)/i.test(String(j2?.message || ''));
      if (!cred2) throw new Error('SESSION_LOST');
      return { status: 401, ...j2 };
    }
  }

  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}



export const PinApi = {
  status: () => pinCall('/status', 'GET'),
  set: (pin: string, confirmPin: string) => pinCall('/set', 'POST', { pin, confirmPin }),
  verify: (pin: string) => pinCall('/verify', 'POST', { pin }),
  forgot: () => pinCall('/forgot', 'POST'),
  reset: (otp: string, pin: string, confirmPin: string) =>
    pinCall('/reset', 'POST', { otp, pin, confirmPin }),
};

/* ---------------- digit input ---------------- */
function DigitInput({ length = 4, value, onChange, autoFocus = false, mask = true, disabled = false }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const chars = value.padEnd(length, ' ').slice(0, length).split('');

  const setAt = (i: number, ch: string) => {
    const arr = value.padEnd(length, ' ').split('');
    arr[i] = ch || ' ';
    onChange(arr.join('').replace(/\s/g, ''));
  };

  return (
    <div className="flex justify-center gap-3">
      {chars.map((c, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          value={c.trim()}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          inputMode="numeric"
          type={mask ? 'password' : 'text'}
          maxLength={1}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, '').slice(-1);
            setAt(i, d);
            if (d && i < length - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !c.trim() && i > 0) refs.current[i - 1]?.focus();
          }}
          className="w-14 h-16 text-center text-2xl font-bold rounded-xl bg-slate-800/80 border border-slate-600 text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/40 disabled:opacity-50"
        />
      ))}
    </div>
  );
}

function Shell({ icon, title, subtitle, children, onBack }) {
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-950 via-slate-900 to-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-700/70 bg-slate-900/80 backdrop-blur p-7 shadow-2xl">
        {onBack && (
          <button onClick={onBack} className="mb-3 flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-400">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        )}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center mb-3">
            {icon}
          </div>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

const btn =
  'w-full mt-5 py-3 rounded-xl font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition disabled:opacity-50 disabled:cursor-not-allowed';

/* ---------------- main gate ---------------- */
export default function PinGate({ children, onLogout }: { children: any; onLogout?: () => void }) {
  const [screen, setScreen] = useState<'loading' | 'create' | 'enter' | 'forgot' | 'reset' | 'ok'>('loading');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const reset = () => { setPin(''); setConfirmPin(''); setOtp(''); setError(''); };

  // Session is really gone (refresh token rejected) → send the user back to the
  // LOGIN page (never the public landing page), so signing in returns to the dashboard.
  const handleSessionLost = useCallback(async (e: any) => {
    if (String(e?.message || e) !== 'SESSION_LOST') return false;
    // One last recovery attempt before giving up — avoids bouncing out on a blip.
    try {
      const { data } = await supabase.auth.refreshSession();
      if (data?.session?.access_token) { setError('Session refreshed — please enter your PIN again.'); return true; }
    } catch {}
    try { await supabase.auth.signOut(); } catch {}
    sessionStorage.removeItem(UNLOCK_KEY);
    window.location.replace('/login');
    return true;
  }, []);


  const refreshStatus = useCallback(async () => {
    try {
      const r = await PinApi.status();
      if (r.status !== 200) { setScreen('ok'); return; } // never hard-block on API failure
      setLockedUntil(r.lockedUntil || null);
      if (!r.hasPin) { setScreen('create'); return; }
      // Always ask for the PIN on a fresh app load / login — no silent grace period.
      sessionStorage.removeItem(UNLOCK_KEY);
      setScreen('enter');
    } catch (e: any) {
      if (String(e?.message || e) === 'SESSION_LOST') { await handleSessionLost(e); return; }
      setScreen('ok');
    }
  }, [handleSessionLost]);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  // countdown ticker while locked
  useEffect(() => {
    if (!lockedUntil) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  // Keep the Supabase session alive while the PIN screen is open, so the
  // token can't silently expire between login and PIN verification.
  useEffect(() => {
    if (screen === 'ok' || screen === 'loading') return;
    const t = setInterval(() => { supabase.auth.refreshSession().catch(() => {}); }, 4 * 60 * 1000);
    return () => clearInterval(t);
  }, [screen]);

  // re-lock when the tab has been hidden for > 2 min
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > RELOCK_MS) {
        sessionStorage.removeItem(UNLOCK_KEY);
        setScreen((s) => (s === 'ok' ? 'enter' : s));
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const unlock = () => {
    sessionStorage.setItem(UNLOCK_KEY, String(Date.now()));
    // Restart the idle-timeout clock so unlocking counts as fresh activity and the
    // user lands on the dashboard instead of being bounced out again.
    try { SessionManager.extend(); } catch {}
    setScreen('ok'); setInfo(''); reset();
  };


  const lockedRemaining = lockedUntil ? new Date(lockedUntil).getTime() - now : 0;
  const isLocked = lockedRemaining > 0;

  const doSet = async () => {
    setError(''); setBusy(true);
    try {
      const r = await PinApi.set(pin, confirmPin);
      if (r.status === 200) unlock(); else setError(r.message || 'Could not save PIN');
    } catch (e: any) { if (!(await handleSessionLost(e))) setError(e.message); } finally { setBusy(false); }
  };

  const doVerify = async () => {
    setError(''); setBusy(true);
    try {
      const r = await PinApi.verify(pin);
      if (r.status === 200) unlock();
      else if (r.status === 404) setScreen('create');
      else if (r.status === 423) { setLockedUntil(r.lockedUntil); setError('Too many attempts. PIN locked.'); setPin(''); }
      else { setError(`${r.message || 'Incorrect PIN'}${r.attemptsLeft != null ? ` — ${r.attemptsLeft} attempts left` : ''}`); setPin(''); }
    } catch (e: any) { if (!(await handleSessionLost(e))) setError(e.message); } finally { setBusy(false); }
  };


  const doForgot = async () => {
    setError(''); setInfo(''); setBusy(true);
    try {
      const r = await PinApi.forgot();
      if (r.status === 200) {
        setInfo(`${r.message}${r.mobile ? ` (${r.mobile})` : ''}${r.email ? ` (${r.email})` : ''}`);
        setScreen('reset'); setPin(''); setConfirmPin(''); setOtp('');
      } else setError(r.message || 'Could not send OTP');
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const doReset = async () => {
    setError(''); setBusy(true);
    try {
      const r = await PinApi.reset(otp, pin, confirmPin);
      if (r.status === 200) {
        // PIN changed — force the user to sign in with the NEW pin.
        sessionStorage.removeItem(UNLOCK_KEY);
        setPin(''); setConfirmPin(''); setOtp(''); setError('');
        setLockedUntil(null);
        setInfo('PIN reset successful. Please enter your new PIN to continue.');
        setScreen('enter');
      } else setError(r.message || 'Reset failed');
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };


  const Err = () => error ? <p className="mt-3 text-center text-sm text-red-400">{error}</p> : null;

  if (screen === 'loading') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
      </div>
    );
  }

  if (screen === 'ok') return children;

  if (screen === 'create') {
    return (
      <Shell icon={<ShieldCheck className="w-7 h-7 text-cyan-400" />} title="Create your PIN"
        subtitle="Set a 4-digit PIN to secure your account">
        <p className="text-xs text-slate-400 mb-2 text-center">Enter PIN</p>
        <DigitInput value={pin} onChange={setPin} autoFocus />
        <p className="text-xs text-slate-400 mt-5 mb-2 text-center">Confirm PIN</p>
        <DigitInput value={confirmPin} onChange={setConfirmPin} />
        <Err />
        <button className={btn} disabled={busy || pin.length !== 4 || confirmPin.length !== 4} onClick={doSet}>
          {busy ? 'Saving…' : 'Save PIN'}
        </button>
      </Shell>
    );
  }

  if (screen === 'enter') {
    return (
      <Shell icon={<Lock className="w-7 h-7 text-cyan-400" />} title="Enter your PIN"
        subtitle={isLocked ? 'PIN temporarily locked' : 'Unlock to continue to your dashboard'}>
        {info && <p className="mb-4 text-center text-sm text-emerald-400">{info}</p>}
        <DigitInput value={pin} onChange={setPin} autoFocus disabled={isLocked} />
        {isLocked && (
          <p className="mt-3 text-center text-sm text-amber-400">
            Try again in {Math.ceil(lockedRemaining / 1000 / 60)} min
          </p>
        )}
        <Err />
        <button className={btn} disabled={busy || isLocked || pin.length !== 4} onClick={doVerify}>
          {busy ? 'Verifying…' : 'Unlock'}
        </button>
        <div className="mt-4 flex items-center justify-between text-xs">
          <button onClick={() => { reset(); setScreen('forgot'); }} className="text-cyan-400 hover:underline">Forgot PIN?</button>
          {onLogout && <button onClick={onLogout} className="text-slate-400 hover:text-white">Use another account</button>}
        </div>
      </Shell>
    );
  }

  if (screen === 'forgot') {
    return (
      <Shell icon={<KeyRound className="w-7 h-7 text-cyan-400" />} title="Forgot PIN"
        subtitle="We'll send a 6-digit OTP by SMS to your registered mobile number"
        onBack={() => { reset(); setScreen('enter'); }}>
        <Err />
        <button className={btn} disabled={busy} onClick={doForgot}>{busy ? 'Sending…' : 'Send OTP'}</button>
      </Shell>
    );
  }

  // reset
  return (
    <Shell icon={<KeyRound className="w-7 h-7 text-cyan-400" />} title="Reset PIN" subtitle={info || 'Enter the OTP and your new PIN'}
      onBack={() => { reset(); setScreen('enter'); }}>
      <p className="text-xs text-slate-400 mb-2 text-center">OTP (6 digits sent by SMS)</p>
      <DigitInput length={6} value={otp} onChange={setOtp} mask={false} autoFocus />
      <p className="text-xs text-slate-400 mt-5 mb-2 text-center">New PIN</p>
      <DigitInput value={pin} onChange={setPin} />
      <p className="text-xs text-slate-400 mt-5 mb-2 text-center">Confirm new PIN</p>
      <DigitInput value={confirmPin} onChange={setConfirmPin} />
      <Err />
      <button className={btn} disabled={busy || otp.length !== 6 || pin.length !== 4 || confirmPin.length !== 4} onClick={doReset}>
        {busy ? 'Saving…' : 'Reset PIN'}
      </button>
      <button onClick={doForgot} disabled={busy} className="mt-3 w-full text-xs text-cyan-400 hover:underline">Resend OTP</button>
    </Shell>
  );
}
