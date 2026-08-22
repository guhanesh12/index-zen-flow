// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { CheckCircle2, AlertTriangle, RefreshCw, Key, Download, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth, getAccessToken } from '../utils/apiClient';

interface AliceblueConnectProps {
  serverUrl: string;
  accessToken: string;
  onConnected?: () => void;
}

/**
 * 🔷 Aliceblue connect card (ANT API v2).
 * Docs: https://v2api.aliceblueonline.com/
 * Login is User ID + API key (no OAuth) — credentials are stored once and the
 * daily session is minted automatically every morning.
 */
export function AliceblueConnect({ serverUrl, accessToken, onConnected }: AliceblueConnectProps) {
  const [userId, setUserId] = useState('');
  const [appCode, setAppCode] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [instruments, setInstruments] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [awaitingLogin, setAwaitingLogin] = useState(false);
  const pollRef = useRef<any>(null);

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

  /** fetch with a hard timeout so the button can never hang forever */
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
      const { data } = await call('/broker/aliceblue/instruments/status', {}, 15000);
      setInstruments(data || null);
      return data;
    } catch {
      return null;
    }
  };

  const load = async () => {
    try {
      setLoading(true);
      const { data } = await call('/broker/aliceblue/status', {}, 20000);
      setStatus(data || null);
      if (data?.clientCode && !userId) setUserId(data.clientCode);
      await loadInstruments();
    } catch (e) {
      console.error('aliceblue status failed', e);
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

  const connect = async () => {
    if (!userId.trim() || apiKey.trim().length < 5) {
      return toast.error('Enter your Aliceblue User ID and API key');
    }
    try {
      setBusy(true);
      const { res, data } = await call('/broker/aliceblue/login', {
        method: 'POST',
        body: JSON.stringify({ userId: userId.trim().toUpperCase(), apiKey: apiKey.trim() }),
      });
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Aliceblue login failed');
      toast.success('Aliceblue connected — contracts are syncing in the background');
      setApiKey('');
      await load();
      onConnected?.();
    } catch (e: any) {
      toast.error(e?.name === 'AbortError' ? 'Aliceblue did not respond in time. Try again.' : (e.message || 'Aliceblue login failed'));
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

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: '#2563eb' }} />
          Aliceblue
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
          Create an app in the ANT web terminal → Apps, then paste your Aliceblue User ID and
          API key here. Orders, funds and positions route through Aliceblue from your static IP.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.lastError && !connected && (
          <Alert className="bg-rose-950/40 border-rose-900">
            <AlertDescription className="text-rose-300 text-sm">{status.lastError}</AlertDescription>
          </Alert>
        )}

        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2">
          {[
            { label: 'Redirect URL', value: status?.redirectUri },
            { label: 'Postback URL', value: status?.postbackUrl },
            { label: 'Primary Static IP', value: status?.staticIp },
          ].filter((r) => r.value).map((r) => (
            <div key={r.label} className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-500 w-32 shrink-0">{r.label}</span>
              <code className="text-[11px] text-zinc-200 break-all">{r.value}</code>
              <Button size="sm" variant="ghost" className="text-zinc-400 shrink-0 ml-auto"
                onClick={() => copy(r.value, r.label)}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ab-userid" className="text-zinc-300">Aliceblue User ID</Label>
            <Input
              id="ab-userid"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="e.g. AB1234"
              className="bg-zinc-950 border-zinc-800"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ab-apikey" className="text-zinc-300">API key</Label>
            <Input
              id="ab-apikey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={status?.savedCredentials ? `saved ${status.apiKeyMasked || '••••'}` : 'ANT API key'}
              className="bg-zinc-950 border-zinc-800"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={connect} disabled={busy} className="bg-blue-600 hover:bg-blue-500">
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Key className="w-4 h-4 mr-2" />}
            {busy ? 'Connecting…' : 'Connect Aliceblue'}
          </Button>
          {status?.savedCredentials && (
            <Button variant="outline" className="border-zinc-700" disabled={busy}
              onClick={() => action('/broker/aliceblue/reconnect', 'Aliceblue session refreshed')}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Reconnect (saved login)
            </Button>
          )}
          <Button variant="outline" className="border-zinc-700" disabled={busy || !status?.savedCredentials}
            onClick={() => action('/broker/aliceblue/verify', 'Aliceblue session is valid')}>
            <CheckCircle2 className="w-4 h-4 mr-2" /> Verify
          </Button>
          <Button variant="outline" className="border-zinc-700" disabled={busy}
            onClick={() => action('/broker/aliceblue/instruments/sync', 'Aliceblue contract sync started')}>
            <Download className="w-4 h-4 mr-2" /> Sync contracts
          </Button>
          {status?.savedCredentials && (
            <Button variant="ghost" className="text-rose-400" disabled={busy}
              onClick={() => action('/broker/aliceblue/disconnect', 'Aliceblue disconnected')}>
              Disconnect
            </Button>
          )}
        </div>

        {connected && typeof status?.balance === 'number' && (
          <Alert className="bg-emerald-950/40 border-emerald-900">
            <AlertDescription className="text-emerald-300 text-sm">
              Live Aliceblue funds: ₹{status.balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })} — connection verified
            </AlertDescription>
          </Alert>
        )}

        {instruments?.syncError && (
          <Alert className="bg-amber-950/40 border-amber-900">
            <AlertDescription className="text-amber-300 text-sm">
              Contract sync problem: {instruments.syncError}
            </AlertDescription>
          </Alert>
        )}

        <p className="text-xs text-zinc-500">
          Contracts mapped: {instruments?.mappedContracts ?? 0}
          {instruments?.syncing ? ' · syncing…' : instruments?.freshToday ? ' · synced today' : ' · sync pending'}
          {instruments?.expiries
            ? ` · ${Object.entries(instruments.expiries).map(([k, v]: any) => `${k}: ${(v || []).join(', ')}`).join(' | ')}`
            : ''}
        </p>
      </CardContent>
    </Card>
  );
}

export default AliceblueConnect;
