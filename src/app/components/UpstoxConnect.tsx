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

interface UpstoxConnectProps {
  serverUrl: string;
  accessToken: string;
  onConnected?: () => void;
}

/**
 * 🟣 Upstox connect card (OAuth2).
 * Docs: https://upstox.com/developer/api-documentation/authentication
 */
export function UpstoxConnect({ serverUrl, accessToken, onConnected }: UpstoxConnectProps) {
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [redirectUri, setRedirectUri] = useState('');
  const [instruments, setInstruments] = useState<any>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const tok = async () => (await getAccessToken()) || accessToken;

  const load = async () => {
    try {
      setLoading(true);
      const t = await tok();
      const [s, i] = await Promise.all([
        fetchWithAuth(`${serverUrl}/broker/upstox/status`, { headers: { Authorization: `Bearer ${t}` } }).then((r) => r.json()),
        fetchWithAuth(`${serverUrl}/broker/upstox/instruments/status`, { headers: { Authorization: `Bearer ${t}` } }).then((r) => r.json()),
      ]);
      setStatus(s?.upstox || null);
      setRedirectUri(s?.redirectUri || s?.upstox?.redirect_uri || '');
      setInstruments(i || null);
      const bal = s?.liveCheck?.balance ?? s?.balance;
      setBalance(typeof bal === 'number' ? bal : null);
    } catch (e) {
      console.error('upstox status failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [serverUrl]);

  const saveKeys = async () => {
    if (apiKey.trim().length < 5 || apiSecret.trim().length < 5) {
      return toast.error('Enter your Upstox API key and secret');
    }
    try {
      setBusy(true);
      const t = await tok();
      const res = await fetchWithAuth(`${serverUrl}/broker/upstox/save-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ apiKey: apiKey.trim(), apiSecret: apiSecret.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Saving Upstox keys failed');
      toast.success('Keys saved — now login with Upstox');
      setApiKey('');
      setApiSecret('');
      await load();
      onConnected?.();
    } catch (e: any) {
      toast.error(e.message || 'Saving Upstox keys failed');
    } finally {
      setBusy(false);
    }
  };

  const login = async () => {
    try {
      setBusy(true);
      const t = await tok();
      const res = await fetchWithAuth(`${serverUrl}/broker/upstox/login-url`, { headers: { Authorization: `Bearer ${t}` } });
      const data = await res.json();
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Could not build Upstox login URL');
      window.open(data.url, '_blank', 'width=520,height=720');
      toast.info('Complete the Upstox login in the new window, then press Verify');
    } catch (e: any) {
      toast.error(e.message || 'Upstox login failed');
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

  const connected = !!status?.access_token_set && status?.last_status === 'connected';

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: '#7c3aed' }} />
          Upstox
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
          Create an app at account.upstox.com → Developer → Apps, paste the API key and secret here,
          then login. Orders, funds and positions will route through Upstox.
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
            <p className="text-xs text-zinc-400 mb-1">Set this exact Redirect URI in your Upstox app:</p>
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
            <Label htmlFor="upstox-key" className="text-zinc-300">API key</Label>
            <Input
              id="upstox-key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={status?.api_key_set ? '•••••• saved' : 'Upstox API key'}
              className="bg-zinc-950 border-zinc-800"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="upstox-secret" className="text-zinc-300">API secret</Label>
            <Input
              id="upstox-secret"
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder={status?.api_secret_set ? '•••••• saved' : 'Upstox API secret'}
              className="bg-zinc-950 border-zinc-800"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={saveKeys} disabled={busy} className="bg-violet-600 hover:bg-violet-500">
            <Key className="w-4 h-4 mr-2" /> {busy ? 'Saving…' : 'Save keys'}
          </Button>
          <Button onClick={login} disabled={busy || !status?.api_key_set} className="bg-emerald-600 hover:bg-emerald-500">
            <ExternalLink className="w-4 h-4 mr-2" /> Login with Upstox
          </Button>
          <Button variant="outline" className="border-zinc-700" disabled={busy || !status?.access_token_set}
            onClick={() => action('/broker/upstox/verify', 'Upstox session is valid')}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Verify
          </Button>
          <Button variant="outline" className="border-zinc-700" disabled={busy}
            onClick={() => action('/broker/upstox/instruments/sync', 'Upstox contracts refreshed')}>
            <Download className="w-4 h-4 mr-2" /> Sync contracts
          </Button>
          {status?.access_token_set && (
            <Button variant="ghost" className="text-rose-400" disabled={busy}
              onClick={() => action('/broker/upstox/disconnect', 'Upstox disconnected')}>
              Disconnect
            </Button>
          )}
        </div>

        {connected && balance !== null && (
          <Alert className="bg-emerald-950/40 border-emerald-900">
            <AlertDescription className="text-emerald-300 text-sm">
              Live Upstox funds: ₹{balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })} — connection verified
            </AlertDescription>
          </Alert>
        )}

        <p className="text-xs text-zinc-500">
          Contracts mapped: {instruments?.mappedContracts ?? 0}
          {instruments?.freshToday ? ' · synced today' : ' · sync pending'}
          {status?.upstox_user_name ? ` · ${status.upstox_user_name}` : ''}
        </p>
      </CardContent>
    </Card>
  );
}

export default UpstoxConnect;
