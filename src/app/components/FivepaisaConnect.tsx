// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { CheckCircle2, AlertTriangle, RefreshCw, Key, Download, Copy, Loader2, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth, getAccessToken } from '../utils/apiClient';

interface FivepaisaConnectProps {
  serverUrl: string;
  accessToken: string;
  onConnected?: () => void;
}

/**
 * 🟡 5paisa connect card (Xstream Open API).
 * Docs: https://xstream.5paisa.com/dev-docs/user-authentication-system/oauth-login
 * Flow: save App Key + Encryption Key + User Key → OAuth login → RequestToken
 *       → GetAccessToken → daily bearer token (expires 11:59 PM IST).
 */
export function FivepaisaConnect({ serverUrl, accessToken, onConnected }: FivepaisaConnectProps) {
  const [appKey, setAppKey] = useState('');
  const [encryptionKey, setEncryptionKey] = useState('');
  const [userKey, setUserKey] = useState('');
  const [requestToken, setRequestToken] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [instruments, setInstruments] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [awaitingLogin, setAwaitingLogin] = useState(false);
  const pollRef = useRef<any>(null);

  const redirectUri = status?.redirectUri || 'https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/broker/5paisa/callback';

  const tok = async () => {
    try {
      return (await Promise.race([
        getAccessToken(),
        new Promise((r) => setTimeout(() => r(null), 5000)),
      ])) || accessToken;
    } catch {
      return accessToken;
    }
  };

  const call = async (path: string, init: RequestInit = {}, timeoutMs = 45000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const t = await tok();
      const res = await fetchWithAuth(`${serverUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}`, ...(init.headers || {}) },
      });
      const data = await res.json().catch(() => ({}));
      return { res, data };
    } finally {
      clearTimeout(timer);
    }
  };

  const loadInstruments = async () => {
    try {
      const { data } = await call('/broker/5paisa/instruments/status', {}, 15000);
      setInstruments(data || null);
      return data;
    } catch {
      return null;
    }
  };

  const load = async () => {
    try {
      setLoading(true);
      const { data } = await call('/broker/5paisa/status', {}, 20000);
      setStatus(data || null);
      if (data?.connected) setAwaitingLogin(false);
      await loadInstruments();
    } catch (e) {
      console.error('5paisa status failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [serverUrl]);

  // Poll while the shared contract master is still downloading in the background.
  useEffect(() => {
    if (!instruments?.syncing) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(loadInstruments, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [instruments?.syncing]);

  // The popup posts back once 5paisa redirects to our callback.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if ((e.data as any)?.source === '5paisa') { setAwaitingLogin(false); load(); onConnected?.(); }
    };
    const onFocus = () => { if (awaitingLogin) load(); };
    window.addEventListener('message', onMsg);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('message', onMsg);
      window.removeEventListener('focus', onFocus);
    };
  }, [awaitingLogin]);

  // Keep polling status while the user is on the 5paisa login page.
  useEffect(() => {
    if (!awaitingLogin) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [awaitingLogin]);

  /** Step 1 — save the API credentials. */
  const saveKeys = async () => {
    if (appKey.trim().length < 5 || encryptionKey.trim().length < 5 || userKey.trim().length < 3) {
      return toast.error('Enter your 5paisa App Key, Encryption Key and User Key');
    }
    try {
      setBusy(true);
      const { res, data } = await call('/broker/5paisa/save-keys', {
        method: 'POST',
        body: JSON.stringify({
          appKey: appKey.trim(),
          encryptionKey: encryptionKey.trim(),
          userKey: userKey.trim(),
        }),
      });
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not save 5paisa keys');
      toast.success('Keys saved — now login with 5paisa');
      setEncryptionKey('');
      await load();
    } catch (e: any) {
      toast.error(e?.name === 'AbortError' ? '5paisa did not respond in time. Try again.' : (e.message || 'Save failed'));
    } finally {
      setBusy(false);
    }
  };

  /** Step 2 — open the 5paisa OAuth login page. */
  const login = async () => {
    try {
      setBusy(true);
      const { res, data } = await call('/broker/5paisa/login-url', {}, 20000);
      if (!res.ok || !data?.success || !data?.url) throw new Error(data?.error || 'Could not start 5paisa login');
      setAwaitingLogin(true);
      window.open(data.url, '5paisa-login', 'width=560,height=760');
      toast.success('Log in on the 5paisa page — this card updates automatically');
    } catch (e: any) {
      toast.error(e.message || '5paisa login failed');
    } finally {
      setBusy(false);
    }
  };

  /** Fallback — paste the RequestToken from the redirect URL manually. */
  const exchange = async () => {
    if (requestToken.trim().length < 10) return toast.error('Paste the RequestToken from the redirect URL');
    try {
      setBusy(true);
      const { res, data } = await call('/broker/5paisa/exchange', {
        method: 'POST',
        body: JSON.stringify({ requestToken: requestToken.trim() }),
      });
      if (!res.ok || !data?.success) throw new Error(data?.error || '5paisa session exchange failed');
      toast.success('5paisa connected — contracts are syncing in the background');
      setRequestToken('');
      setAwaitingLogin(false);
      await load();
      onConnected?.();
    } catch (e: any) {
      toast.error(e.message || '5paisa session exchange failed');
    } finally {
      setBusy(false);
    }
  };

  const action = async (path: string, okMsg: string) => {
    try {
      setBusy(true);
      const { res, data } = await call(path, { method: 'POST', body: JSON.stringify({}) });
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Request failed');
      toast.success(okMsg);
      await load();
      onConnected?.();
    } catch (e: any) {
      toast.error(e.message || 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const copy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  const connected = !!status?.connected;
  const keysSaved = !!status?.fivepaisa?.app_key_set;

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: '#e11d48' }} />
          5paisa (Xstream API)
          {connected ? (
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="size-3.5" /> Connected
            </span>
          ) : (
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-amber-400">
              <AlertTriangle className="size-3.5" /> Not connected
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Orders, funds and positions route through your 5paisa account from your dedicated static IP.
          Tokens expire daily at 11:59&nbsp;PM IST — login again each trading day.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Redirect URI */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
          <Label className="text-xs text-zinc-400">Redirect / Response URL (register this in the 5paisa developer portal)</Label>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 break-all text-xs text-cyan-300">{redirectUri}</code>
            <Button size="sm" variant="outline" onClick={() => copy(redirectUri, 'Redirect URL')}>
              <Copy className="size-3.5" />
            </Button>
          </div>
        </div>

        {status?.clientCode && (
          <Alert className="border-emerald-800 bg-emerald-950/40">
            <AlertDescription className="text-xs text-emerald-300">
              Logged in as client <b>{status.clientCode}</b>
              {status?.balance != null && <> · Balance ₹{Number(status.balance).toLocaleString('en-IN')}</>}
            </AlertDescription>
          </Alert>
        )}

        {status?.fivepaisa?.last_error && (
          <Alert className="border-amber-800 bg-amber-950/40">
            <AlertDescription className="text-xs text-amber-300">{status.fivepaisa.last_error}</AlertDescription>
          </Alert>
        )}

        {/* Step 1 — credentials */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">App Key / Vendor Key</Label>
            <Input value={appKey} onChange={(e) => setAppKey(e.target.value)} placeholder="App Key" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Encryption Key</Label>
            <Input
              type="password"
              value={encryptionKey}
              onChange={(e) => setEncryptionKey(e.target.value)}
              placeholder={status?.fivepaisa?.encryption_key_set ? '•••••••• (saved)' : 'Encryption Key'}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">User Key (UserId)</Label>
            <Input value={userKey} onChange={(e) => setUserKey(e.target.value)} placeholder="User Key" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={saveKeys} disabled={busy}>
            <Key className="size-4 mr-2" /> Save keys
          </Button>
          <Button onClick={login} disabled={busy || !keysSaved} variant="secondary">
            {awaitingLogin ? <Loader2 className="size-4 mr-2 animate-spin" /> : <LogIn className="size-4 mr-2" />}
            Login with 5paisa
          </Button>
          <Button onClick={() => action('/broker/5paisa/verify', '5paisa session is valid')} disabled={busy || !connected} variant="outline">
            <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Verify
          </Button>
          <Button onClick={() => action('/broker/5paisa/instruments/sync', 'Contract sync started')} disabled={busy} variant="outline">
            <Download className="size-4 mr-2" /> Sync contracts
          </Button>
          <Button onClick={() => action('/broker/5paisa/disconnect', '5paisa disconnected')} disabled={busy || !keysSaved} variant="destructive">
            Disconnect
          </Button>
        </div>

        {/* Fallback token paste */}
        <div className="space-y-1">
          <Label className="text-xs text-zinc-400">
            Popup blocked? Paste the <code>RequestToken</code> from the redirect URL
          </Label>
          <div className="flex gap-2">
            <Input value={requestToken} onChange={(e) => setRequestToken(e.target.value)} placeholder="RequestToken" />
            <Button onClick={exchange} disabled={busy} variant="secondary">Connect</Button>
          </div>
        </div>

        {/* Instrument status */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400">
          {instruments?.syncing ? (
            <span className="inline-flex items-center gap-2 text-cyan-300">
              <Loader2 className="size-3.5 animate-spin" /> Downloading the 5paisa scrip master…
            </span>
          ) : (
            <>
              Contracts mapped: <b className="text-zinc-200">{instruments?.mappedContracts ?? 0}</b>
              {instruments?.freshToday ? ' · fresh today' : ' · not synced today'}
              {instruments?.syncError && <div className="mt-1 text-amber-400">{instruments.syncError}</div>}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default FivepaisaConnect;
