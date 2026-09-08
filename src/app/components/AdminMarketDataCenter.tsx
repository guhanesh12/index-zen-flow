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

const num = (v: any, d = 2) => (v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(d));

const fmtStamp = (v?: string | null) => {
  if (!v) return '—';
  if (/^\d{1,2}:\d{2}$/.test(v)) return v; // already an IST candle stamp
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
};


const actionTone = (action?: string) => {
  if (action === 'BUY_CALL')
    return { card: 'border-emerald-500/50 bg-emerald-500/5', badge: 'bg-emerald-600 text-primary-foreground', bar: 'bg-emerald-500' };
  if (action === 'BUY_PUT')
    return { card: 'border-rose-500/50 bg-rose-500/5', badge: 'bg-rose-600 text-primary-foreground', bar: 'bg-rose-500' };
  if (action === 'EXIT')
    return { card: 'border-orange-500/50 bg-orange-500/5', badge: 'bg-orange-600 text-primary-foreground', bar: 'bg-orange-500' };
  if (action === 'HOLD')
    return { card: 'border-sky-500/50 bg-sky-500/5', badge: 'bg-sky-600 text-primary-foreground', bar: 'bg-sky-500' };
  if (action === 'WAIT')
    return { card: 'border-amber-500/40 bg-amber-500/5', badge: 'bg-amber-500 text-background', bar: 'bg-amber-500' };
  return { card: '', badge: 'bg-muted text-muted-foreground', bar: 'bg-muted-foreground' };
};


export function AdminMarketDataCenter({ serverUrl, accessToken }: Props) {
  const [status, setStatus] = useState<any>(null);
  const [signals, setSignals] = useState<any>(null);
  const [feed, setFeed] = useState<any>(null);
  const [feedLoading, setFeedLoading] = useState(false);
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
        fetch(`${serverUrl}/admin/market-data/signals?tf=5,15`, { headers }),
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

  const loadFeed = useCallback(async () => {
    try {
      setFeedLoading(true);
      const r = await fetch(`${serverUrl}/admin/market-data/candles`, { headers });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d?.error) throw new Error(d?.error || `HTTP ${r.status}`);
      setFeed(d);
    } catch (e: any) {
      setFeed(null);
      toast.error(e.message || 'Live candle fetch failed');
    } finally {
      setFeedLoading(false);
    }
  }, [serverUrl, accessToken]);

  useEffect(() => {
    load();
    loadFeed();
    const id = setInterval(() => { load(); loadFeed(); }, 60000);
    return () => clearInterval(id);
  }, [load, loadFeed]);


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
          <CardTitle className="flex items-center gap-2">
            Live Candle Feed Check — 5M &amp; 15M
            {feed && (
              <Badge className={feed.working ? 'bg-emerald-600' : ''} variant={feed.working ? 'default' : 'destructive'}>
                {feed.working ? 'Working' : 'Not receiving data'}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Exact bars the central feed serves to every user engine. Users trade on whichever timeframe they selected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadFeed} disabled={feedLoading}>
              <RefreshCw className={`size-4 mr-2 ${feedLoading ? 'animate-spin' : ''}`} />
              {feedLoading ? 'Fetching live candles…' : 'Fetch live candles'}
            </Button>
            {feed?.fetchedAt && (
              <span className="text-xs text-muted-foreground">
                Updated {new Date(feed.fetchedAt).toLocaleTimeString('en-IN')}
              </span>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {['NIFTY', 'BANKNIFTY', 'SENSEX'].map((idx) => {
              const row = feed?.indices?.[idx];
              return (
                <div key={idx} className="rounded-lg border p-3 space-y-2">
                  <div className="font-semibold">{idx}</div>
                  {['5m', '15m'].map((tf) => {
                    const d = row?.[tf];
                    return (
                      <div key={tf} className="rounded-md bg-muted/40 p-2 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{tf} candle</span>
                          <Badge variant={d?.ok ? 'default' : 'secondary'} className={d?.ok ? 'bg-emerald-600' : ''}>
                            {d?.ok ? (d.source === 'central' ? 'Central OK' : d.source) : 'No data'}
                          </Badge>
                        </div>
                        {d?.last ? (
                          <>
                            <div>
                              O {Number(d.last.open).toFixed(2)} · H {Number(d.last.high).toFixed(2)} · L{' '}
                              {Number(d.last.low).toFixed(2)} · C {Number(d.last.close).toFixed(2)}
                            </div>
                            <div className="text-muted-foreground">
                              {new Date(
                                Number(d.last.timestamp) < 1e12 ? Number(d.last.timestamp) * 1000 : Number(d.last.timestamp)
                              ).toLocaleString('en-IN')}{' '}
                              · {d.count} bars
                            </div>
                          </>
                        ) : (
                          <div className="text-muted-foreground">{d?.error || 'Awaiting data'}</div>
                        )}
                        {d?.signal && (
                          <div className="text-muted-foreground">
                            Shared signal: <strong>{d.signal.action}</strong> ({d.signal.confidence ?? 0}%)
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {['5m', '15m'].map((tfKey) => (
        <Card key={tfKey}>
          <CardHeader>
            <CardTitle>Shared Signal Snapshot — {tfKey.toUpperCase()}</CardTitle>
            <CardDescription>
              Exact signal every user receives on the {tfKey} candle, with the full reason it traded or skipped.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-3">
            {['NIFTY', 'BANKNIFTY', 'SENSEX'].map((idx) => {
              const s = signals?.[idx]?.[tfKey];
              const tone = actionTone(s?.action);
              return (
                <div key={idx} className={`rounded-lg border p-3 space-y-2 ${tone.card}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{idx}</span>
                    <Badge className={tone.badge}>{s?.action || (s?.error ? 'Error' : 'No data')}</Badge>
                  </div>

                  {!s || s.error ? (
                    <p className="text-xs text-muted-foreground">{s?.error || 'Waiting for first shared candle'}</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{s.confidence ?? 0}% confidence</span>
                        <span>· candle {fmtStamp(s.candleStamp)}</span>
                        {s.live && <Badge variant="outline" className="text-[10px]">live calc</Badge>}
                        {s.bias && <span>· {s.bias}</span>}
                        {s.marketState && <span>· {s.marketState}</span>}
                      </div>

                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div className={`h-full ${tone.bar}`} style={{ width: `${Math.min(100, Math.max(0, s.confidence ?? 0))}%` }} />
                      </div>

                      {s.reason && <p className="text-xs">{s.reason}</p>}

                      <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                        <span>RSI {num(s.indicators?.rsi)}</span>
                        <span>ADX {num(s.indicators?.adx)}</span>
                        <span>VWAP {num(s.indicators?.vwap)}</span>
                        <span>EMA9 {num(s.indicators?.ema9)}</span>
                        <span>Vol ×{num(s.volume?.ratio)}</span>
                        <span>Body {num(s.volume?.bodyPercent)}%</span>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary" className="text-[10px]">
                          Confirmations {s.confirmations?.total ?? 0}/{s.confirmations?.required ?? 0}
                        </Badge>
                        {s.regime?.type && <Badge variant="outline" className="text-[10px]">{s.regime.type}</Badge>}
                        {s.quality?.tier && <Badge variant="outline" className="text-[10px]">{s.quality.tier}</Badge>}
                        {s.volume?.orderFlow && <Badge variant="outline" className="text-[10px]">Flow {s.volume.orderFlow}</Badge>}
                      </div>

                      {!!s.confirmations?.passed?.length && (
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                          ✅ {s.confirmations.passed.join(', ')}
                        </p>
                      )}
                      {!!s.confirmations?.failed?.length && (
                        <p className="text-[11px] text-muted-foreground">✖ {s.confirmations.failed.join(', ')}</p>
                      )}

                      {s.tradeTaken ? (
                        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 space-y-1">
                          <p className="text-[11px] font-medium">Why this trade was taken</p>
                          <ul className="list-disc pl-4 text-[11px] space-y-0.5">
                            {(s.whyTrade || []).map((r: string, i: number) => <li key={i}>{r}</li>)}
                          </ul>
                          {s.risk?.entry != null && (
                            <p className="text-[11px] text-muted-foreground">
                              Entry {num(s.risk.entry)} · Target {num(s.risk.target)} · SL {num(s.risk.stopLoss)} · RR {num(s.risk.rr)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 space-y-1">
                          <p className="text-[11px] font-medium">Why no trade was taken</p>
                          <ul className="list-disc pl-4 text-[11px] space-y-0.5">
                            {(s.whyNoTrade || []).length
                              ? s.whyNoTrade.map((r: string, i: number) => <li key={i}>{r}</li>)
                              : <li>Conditions not met on this candle</li>}
                          </ul>
                        </div>
                      )}

                      {!!s.patterns?.length && (
                        <p className="text-[11px] text-muted-foreground">Patterns: {s.patterns.join(', ')}</p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}


    </div>
  );
}

export default AdminMarketDataCenter;
