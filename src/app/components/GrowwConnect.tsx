// @ts-nocheck
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { CheckCircle2, AlertTriangle, RefreshCw, Key, Download } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth, getAccessToken } from '../utils/apiClient';

interface GrowwConnectProps {
  serverUrl: string;
  accessToken: string;
  onConnected?: () => void;
}

/**
 * 🟢 Groww Trade API connect card.
 * Groww uses a single access token created in Groww → Profile → Trading APIs.
 */
export function GrowwConnect({ serverUrl, accessToken, onConnected }: GrowwConnectProps) {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<any>(null);
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
        fetchWithAuth(`${serverUrl}/broker/groww/status`, { headers: { Authorization: `Bearer ${t}` } }).then((r) => r.json()),
        fetchWithAuth(`${serverUrl}/broker/groww/instruments/status`, { headers: { Authorization: `Bearer ${t}` } }).then((r) => r.json()),
      ]);
      setStatus(s?.groww || null);
      setInstruments(i || null);
      const bal = s?.liveCheck?.balance ?? s?.balance;
      setBalance(typeof bal === 'number' ? bal : null);
    } catch (e: any) {
      console.error('groww status failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [serverUrl]);

  const save = async () => {
    if (token.trim().length < 20) return toast.error('Paste your Groww Trade API access token');
    try {
      setBusy(true);
      const t = await tok();
      const res = await fetchWithAuth(`${serverUrl}/broker/groww/save-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ accessToken: token.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Groww connection failed');
      toast.success('Groww connected — contracts synced');
      setToken('');
      await load();
      onConnected?.();
    } catch (e: any) {
      toast.error(e.message || 'Groww connection failed');
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
          <span className="size-2.5 rounded-full" style={{ backgroundColor: '#00b386' }} />
          Groww Trade API
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
          Create an access token in Groww → Profile → Trading APIs, then paste it here. Orders,
          funds and positions will route through Groww.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.last_error && (
          <Alert className="bg-rose-950/40 border-rose-900">
            <AlertDescription className="text-rose-300 text-sm">{status.last_error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="groww-token" className="text-zinc-300">Access token</Label>
          <Input
            id="groww-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your Groww Trade API access token"
            className="bg-zinc-950 border-zinc-800"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={busy} className="bg-emerald-600 hover:bg-emerald-500">
            <Key className="w-4 h-4 mr-2" /> {busy ? 'Saving…' : 'Save & Connect'}
          </Button>
          <Button variant="outline" className="border-zinc-700" disabled={busy || !status?.access_token_set}
            onClick={() => action('/broker/groww/verify', 'Groww session is valid')}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Verify
          </Button>
          <Button variant="outline" className="border-zinc-700" disabled={busy}
            onClick={() => action('/broker/groww/instruments/sync', 'Groww contracts refreshed')}>
            <Download className="w-4 h-4 mr-2" /> Sync contracts
          </Button>
          {status?.access_token_set && (
            <Button variant="ghost" className="text-rose-400" disabled={busy}
              onClick={() => action('/broker/groww/disconnect', 'Groww disconnected')}>
              Disconnect
            </Button>
          )}
        </div>

        {connected && balance !== null && (
          <Alert className="bg-emerald-950/40 border-emerald-900">
            <AlertDescription className="text-emerald-300 text-sm">
              Live Groww funds: ₹{balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })} — connection verified
            </AlertDescription>
          </Alert>
        )}

        <p className="text-xs text-zinc-500">
          Contracts mapped: {instruments?.mappedContracts ?? 0}
          {instruments?.freshToday ? ' · synced today' : ' · sync pending'}
        </p>
      </CardContent>
    </Card>
  );
}

export default GrowwConnect;
