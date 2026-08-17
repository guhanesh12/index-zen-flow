// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { toast } from 'sonner';
import { Satellite, RefreshCw, ShieldCheck, AlertTriangle, Radio } from 'lucide-react';

interface Props {
  serverUrl: string;
  accessToken: string;
}

export function AdminMarketDataCenter({ serverUrl, accessToken }: Props) {
  const [status, setStatus] = useState<any>(null);
  const [signals, setSignals] = useState<any>(null);
  const [clientId, setClientId] = useState('');
  const [token, setToken] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [sRes, sigRes] = await Promise.all([
        fetch(`${serverUrl}/admin/market-data/status`, { headers }),
        fetch(`${serverUrl}/admin/market-data/signals?tf=15`, { headers }),
      ]);
      const s = await sRes.json().catch(() => null);
      const sig = await sigRes.json().catch(() => null);
      if (s?.success) {
        setStatus(s);
        setClientId(s.clientId || '');
        setEnabled(s.enabled ?? true);
      }
      if (sig?.success) setSignals(sig.signals);
    } catch (e: any) {
      console.error('market data status failed', e);
    } finally {
      setLoading(false);
    }
  }, [serverUrl, accessToken]);

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  const save = async () => {
    if (!clientId.trim()) return toast.error('Dhan Client ID is required');
    if (!token.trim() && !status?.configured) return toast.error('Access token is required');
    try {
      setSaving(true);
      const r = await fetch(`${serverUrl}/admin/market-data/save`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ clientId: clientId.trim(), accessToken: token.trim(), enabled }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d?.error) throw new Error(d?.error || `HTTP ${r.status}`);
      toast.success(`Central market data saved (${d.verifiedCandles || 0} candles verified)`);
      setToken('');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    try {
      setTesting(true);
      const r = await fetch(`${serverUrl}/admin/market-data/test`, {
        method: 'POST',
        headers,
        body: JSON.stringify(token.trim() ? { clientId: clientId.trim(), accessToken: token.trim() } : {}),
      });
      const d = await r.json().catch(() => ({}));
      if (d?.success) toast.success(`Connection OK — ${d.candles} candles fetched`);
      else toast.error(d?.error || 'Connection failed');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const statusBadge = () => {
    const s = status?.status || 'not_configured';
    if (!status?.configured) return <Badge variant="destructive">Not configured</Badge>;
    if (!status?.enabled) return <Badge variant="secondary">Disabled</Badge>;
    if (s === 'active') return <Badge className="bg-emerald-600">Active</Badge>;
    if (s === 'error') return <Badge variant="destructive">Error</Badge>;
    return <Badge variant="secondary">Unknown</Badge>;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Satellite className="size-5" />
            Central Signal Center — Dhan Market Data
            {statusBadge()}
          </CardTitle>
          <CardDescription>
            One admin Dhan data subscription feeds index candles for every user, so all users receive the
            <strong> exact same signal </strong> on the same candle. Users still connect their own broker token for
            orders, positions and funds.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="md-client">Dhan Client ID (data subscription)</Label>
              <Input
                id="md-client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="e.g. 1100XXXXXX"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="md-token">Access Token</Label>
              <Input
                id="md-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={status?.configured ? '•••••••• (saved — enter to replace)' : 'Paste Dhan access token'}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="font-medium">Use central data for all users</p>
              <p className="text-sm text-muted-foreground">
                When off, each engine falls back to the user's own Dhan token for market data.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {status?.lastError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="size-4 mt-0.5" />
              <span>{status.lastError}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving}>
              <ShieldCheck className="size-4 mr-2" />
              {saving ? 'Verifying & saving…' : 'Verify & Save'}
            </Button>
            <Button variant="outline" onClick={test} disabled={testing}>
              <Radio className="size-4 mr-2" />
              {testing ? 'Testing…' : 'Test Connection'}
            </Button>
            <Button variant="ghost" onClick={load} disabled={loading}>
              <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {status?.lastVerifiedAt && (
            <p className="text-xs text-muted-foreground">
              Last verified: {new Date(status.lastVerifiedAt).toLocaleString('en-IN')}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shared Signal Snapshot (15M)</CardTitle>
          <CardDescription>The signal every user receives for the latest closed candle.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {['NIFTY', 'BANKNIFTY', 'SENSEX'].map((idx) => {
            const s = signals?.[idx];
            return (
              <div key={idx} className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{idx}</span>
                  <Badge variant={s?.action && s.action !== 'WAIT' ? 'default' : 'secondary'}>
                    {s?.action || 'No data'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {s ? `${s.confidence ?? 0}% • candle ${s.candleStamp || '—'}` : 'Waiting for first shared candle'}
                </p>
                {s?.reason && <p className="text-xs line-clamp-3">{s.reason}</p>}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminMarketDataCenter;
