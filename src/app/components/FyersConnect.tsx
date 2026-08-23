// @ts-nocheck
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { CheckCircle2, AlertTriangle, RefreshCw, Key, Download, ExternalLink, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth, getAccessToken } from '../utils/apiClient';

interface FyersConnectProps {
  serverUrl: string;
  accessToken: string;
  onConnected?: () => void;
}

/**
 * 🔵 Fyers connect card (API v3 OAuth).
 * Docs: https://myapi.fyers.in/docsv3
 */
export function FyersConnect({ serverUrl, accessToken, onConnected }: FyersConnectProps) {
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [redirectUri, setRedirectUri] = useState('');
  const [instruments, setInstruments] = useState<any>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const tok = async () => (await getAccessToken()) || accessToken;

  const [serverConnected, setServerConnected] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async (opts: { quick?: boolean; silent?: boolean } = {}) => {
    try {
      if (!opts.silent) setLoading(true);
      const t = await tok();
      const qs = opts.quick ? '?quick=1' : '';
      const [s, i] = await Promise.all([
        fetchWithAuth(`${serverUrl}/broker/fyers/status${qs}`, { headers: { Authorization: `Bearer ${t}` } }).then((r) => r.json()),
        fetchWithAuth(`${serverUrl}/broker/fyers/instruments/status`, { headers: { Authorization: `Bearer ${t}` } })
          .then((r) => r.json())
          .catch(() => null),
      ]);
      setStatus(s?.fyers || null);
      setServerConnected(typeof s?.connected === 'boolean' ? s.connected : null);
      setRedirectUri(s?.redirectUri || s?.fyers?.redirect_uri || '');
      if (i) setInstruments(i);
      const bal = s?.liveCheck?.balance ?? s?.balance;
      setBalance(typeof bal === 'number' ? bal : null);
      setLoadError(null);
      return s;
    } catch (e: any) {
      console.error('fyers status failed', e);
      setLoadError('Could not reach the broker service. Retrying…');
      // Retry once with the fast (no live probe) status so a slow broker API
      // never makes a real connection look disconnected.
      if (!opts.quick) {
        try { return await load({ quick: true, silent: true }); } catch { /* ignore */ }
      }
      return null;
    } finally {
      if (!opts.silent) setLoading(false);
    }
  };

  useEffect(() => { load(); }, [serverUrl]);

  // Poll for a short while after the login window opens, so the card flips to
  // "connected" even when the callback tab could not message us back.
  const pollAfterLogin = () => {
    let tries = 0;
    const id = setInterval(async () => {
      tries += 1;
      const s = await load({ silent: true });
      if (s?.connected || tries >= 30) {
        clearInterval(id);
        if (s?.connected) { toast.success('Fyers connected'); onConnected?.(); }
      }
    }, 4000);
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin && event.origin !== 'https://api.indexpilotai.com') return;
      if (event.data?.source !== 'fyers') return;
      if (event.data?.ok) {
        toast.success('Fyers connected');
        load();
        onConnected?.();
      }
    };
    window.addEventListener('message', onMessage);
    const onFocus = () => load({ silent: true });
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('focus', onFocus);
    };
  }, [serverUrl]);


  const saveKeys = async () => {
    if (appId.trim().length < 5 || appSecret.trim().length < 5) {
      return toast.error('Enter your Fyers App ID and Secret ID');
    }
    try {
      setBusy(true);
      const t = await tok();
      const res = await fetchWithAuth(`${serverUrl}/broker/fyers/save-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ appId: appId.trim(), appSecret: appSecret.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Saving Fyers keys failed');
      toast.success('Keys saved — now login with Fyers');
      setAppId('');
      setAppSecret('');
      await load();
      onConnected?.();
    } catch (e: any) {
      toast.error(e.message || 'Saving Fyers keys failed');
    } finally {
      setBusy(false);
    }
  };

  const login = async () => {
    try {
      setBusy(true);
      const t = await tok();
      const res = await fetchWithAuth(`${serverUrl}/broker/fyers/login-url`, { headers: { Authorization: `Bearer ${t}` } });
      const data = await res.json();
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Could not build Fyers login URL');
      const popup = window.open(data.url, 'fyers-login', 'width=520,height=720');
      if (!popup) throw new Error('Popup blocked. Allow popups for IndexPilot and try again.');
      toast.info('Complete the Fyers login in the new window — this card updates automatically');
      pollAfterLogin();

    } catch (e: any) {
      toast.error(e.message || 'Fyers login failed');
    } finally {
      setBusy(false);
    }
  };

  const action = async (path: string, okMsg: string) => {
    try {
      setBusy(true);
      const t = await tok();
      const res = await fetchWithAuth(`${serverUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({}),
      });
      const data = await res.json();
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

  const connected =
    serverConnected === true ||
    (!!status?.access_token_set && status?.last_status === 'connected');


  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: '#0ea5e9' }} />
          Fyers
          {connected ? (
            <span className="text-emerald-400 text-xs flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> connected
            </span>
          ) : (
            <span className="text-amber-400 text-xs flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> not connected
            </span>
          )}
        </CardTitle>
        <CardDescription className="text-zinc-400">
          Create an app at myapi.fyers.in → My Apps, paste the App ID and Secret ID here,
          then login. Orders, funds and positions will route through Fyers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.last_error && (
          <Alert className="bg-rose-950/40 border-rose-900">
            <AlertDescription className="text-rose-300 text-sm">{status.last_error}</AlertDescription>
          </Alert>
        )}

        {redirectUri && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <p className="text-xs text-zinc-400 mb-1">Set this exact Redirect URI in your Fyers app:</p>
            <div className="flex items-center gap-2">
              <code className="text-[11px] text-zinc-200 break-all">{redirectUri}</code>
              <Button
                size="sm"
                variant="ghost"
                className="text-zinc-400 shrink-0"
                onClick={() => { navigator.clipboard.writeText(redirectUri); toast.success('Redirect URI copied'); }}
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fyers-appid" className="text-zinc-300">App ID</Label>
            <Input
              id="fyers-appid"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder={status?.app_id_set ? '•••••• saved' : 'e.g. XXXXXXXXXX-100'}
              className="bg-zinc-950 border-zinc-800"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fyers-secret" className="text-zinc-300">Secret ID</Label>
            <Input
              id="fyers-secret"
              type="password"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              placeholder={status?.app_secret_set ? '•••••• saved' : 'Fyers Secret ID'}
              className="bg-zinc-950 border-zinc-800"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={saveKeys} disabled={busy} className="bg-sky-600 hover:bg-sky-500">
            <Key className="w-4 h-4 mr-2" /> {busy ? 'Saving…' : 'Save keys'}
          </Button>
          <Button onClick={login} disabled={busy || !status?.app_id_set} className="bg-emerald-600 hover:bg-emerald-500">
            <ExternalLink className="w-4 h-4 mr-2" /> Login with Fyers
          </Button>
          <Button variant="outline" className="border-zinc-700" disabled={busy || !status?.access_token_set}
            onClick={() => action('/broker/fyers/verify', 'Fyers session is valid')}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Verify
          </Button>
          <Button variant="outline" className="border-zinc-700" disabled={busy}
            onClick={() => action('/broker/fyers/instruments/sync', 'Fyers contracts refreshed')}>
            <Download className="w-4 h-4 mr-2" /> Sync contracts
          </Button>
          {status?.access_token_set && (
            <Button variant="ghost" className="text-rose-400" disabled={busy}
              onClick={() => action('/broker/fyers/disconnect', 'Fyers disconnected')}>
              Disconnect
            </Button>
          )}
        </div>

        {connected && balance !== null && (
          <Alert className="bg-emerald-950/40 border-emerald-900">
            <AlertDescription className="text-emerald-300 text-sm">
              Live Fyers funds: ₹{balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })} — connection verified
            </AlertDescription>
          </Alert>
        )}

        <p className="text-xs text-zinc-500">
          Contracts mapped: {instruments?.mappedContracts ?? 0}
          {instruments?.freshToday ? ' · synced today' : ' · sync pending'}
          {status?.fyers_user_id ? ` · ${status.fyers_user_id}` : ''}
        </p>
      </CardContent>
    </Card>
  );
}

export default FyersConnect;
