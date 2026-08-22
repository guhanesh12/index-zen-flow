// @ts-nocheck
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { CheckCircle2, AlertTriangle, RefreshCw, Key, Download, ExternalLink, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth, getAccessToken } from '../utils/apiClient';

interface AngelOneConnectProps {
  serverUrl: string;
  accessToken: string;
  onConnected?: () => void;
}

/**
 * 🔴 Angel One (SmartAPI) connect card.
 * Angel One does NOT use an OAuth redirect — login is
 * API Key + Client Code + MPIN + TOTP (generated from your TOTP secret).
 * Docs: https://smartapi.angelone.in/docs
 */
export function AngelOneConnect({ serverUrl, accessToken, onConnected }: AngelOneConnectProps) {
  const [apiKey, setApiKey] = useState('');
  const [clientCode, setClientCode] = useState('');
  const [mpin, setMpin] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [instruments, setInstruments] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<'login' | 'verify' | 'sync' | 'disconnect' | null>(null);
  const [message, setMessage] = useState<{ type: 'info' | 'error' | 'success'; text: string } | null>(null);

  const tok = async () => (await getAccessToken()) || accessToken;

  const load = async () => {
    try {
      setLoading(true);
      const t = await tok();
      const [s, i] = await Promise.all([
        fetchWithAuth(`${serverUrl}/broker/angelone/status`, { headers: { Authorization: `Bearer ${t}` } }).then((r) => r.json()),
        fetchWithAuth(`${serverUrl}/broker/angelone/instruments/status`, { headers: { Authorization: `Bearer ${t}` } }).then((r) => r.json()),
      ]);
      setStatus(s || null);
      setInstruments(i || null);
    } catch (e) {
      console.error('angelone status failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [serverUrl]);

  const login = async () => {
    if (apiKey.trim().length < 5) return toast.error('Enter your SmartAPI Trading API Key');
    if (clientCode.trim().length < 3) return toast.error('Enter your Angel One Client Code');
    if (mpin.trim().length < 4) return toast.error('Enter your Angel One MPIN / password');
    if (totpSecret.trim().length < 8) return toast.error('Enter the TOTP secret from SmartAPI → TOTP');
    try {
      setBusy(true);
      setAction('login');
      setMessage({ type: 'info', text: 'Connecting securely to Angel One…' });
      const t = await tok();
      const res = await fetchWithAuth(`${serverUrl}/broker/angelone/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          clientCode: clientCode.trim(),
          password: mpin.trim(),
          totpSecret: totpSecret.replace(/\s+/g, '').trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Angel One login failed');
      toast.success(`Angel One connected${data?.userName ? ` — ${data.userName}` : ''}`);
      setMessage({ type: 'success', text: 'Angel One connected. Instrument sync is running in the background.' });
      setMpin('');
      await load();
      onConnected?.();
    } catch (e: any) {
      toast.error(e.message || 'Angel One login failed');
      setMessage({ type: 'error', text: e.message || 'Angel One login failed' });
    } finally {
      setBusy(false);
      setAction(null);
    }
  };

  const verify = async () => {
    try {
      setBusy(true);
      setAction('verify');
      const t = await tok();
      const res = await fetchWithAuth(`${serverUrl}/broker/angelone/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await res.json();
      if (!data?.connected) throw new Error(data?.error || 'Angel One session is not active');
      toast.success(`Live funds: ₹${Number(data.balance || 0).toLocaleString('en-IN')}`);
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Verification failed');
    } finally {
      setBusy(false);
      setAction(null);
    }
  };

  const syncInstruments = async () => {
    try {
      setBusy(true);
      setAction('sync');
      setMessage({ type: 'info', text: 'Starting Angel One instrument sync…' });
      const t = await tok();
      const res = await fetchWithAuth(`${serverUrl}/broker/angelone/instruments/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ force: true, expiries: 2 }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Instrument sync failed');
      toast.success('Angel One instrument sync started');
      setMessage({ type: 'info', text: 'Instrument sync is running. Contract counts will update automatically.' });
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Instrument sync failed');
      setMessage({ type: 'error', text: e.message || 'Instrument sync failed' });
    } finally {
      setBusy(false);
      setAction(null);
    }
  };

  const disconnect = async () => {
    try {
      setBusy(true);
      setAction('disconnect');
      const t = await tok();
      await fetchWithAuth(`${serverUrl}/broker/angelone/disconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}` },
      });
      toast.success('Angel One disconnected');
      await load();
      onConnected?.();
    } catch (e: any) {
      toast.error(e.message || 'Disconnect failed');
    } finally {
      setBusy(false);
      setAction(null);
    }
  };

  const connected = !!status?.connected;

  useEffect(() => {
    if (!instruments?.syncing) return;
    const timer = window.setInterval(load, 4000);
    return () => window.clearInterval(timer);
  }, [instruments?.syncing, serverUrl]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-4 w-4" />
          Angel One (SmartAPI)
          {connected ? (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600">
              <CheckCircle2 className="h-3 w-3" /> Connected
            </span>
          ) : (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600">
              <AlertTriangle className="h-3 w-3" /> Not connected
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Login with your SmartAPI key, client code, MPIN and TOTP secret. Angel One sessions reset daily,
          so login again each morning before the market opens.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {connected && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              {status?.userName ? `${status.userName} · ` : ''}
              Client {status?.clientCode || '—'}
              {typeof status?.balance === 'number'
                ? ` · Available funds ₹${status.balance.toLocaleString('en-IN')}`
                : ''}
            </AlertDescription>
          </Alert>
        )}

        {!connected && status?.lastError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{status.lastError}</AlertDescription>
          </Alert>
        )}

        {message && (
          <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
            {message.type === 'error' ? <AlertTriangle className="h-4 w-4" /> : <RefreshCw className={`h-4 w-4 ${message.type === 'info' ? 'animate-spin' : ''}`} />}
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {/* SmartAPI "Add App" form fields — Redirect URL is mandatory there */}
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Creating your SmartAPI app? Paste these values in the <strong>Add App</strong> form.
            Angel One still logs in with Client Code + MPIN + TOTP — the redirect URL is only required by their form.
          </p>
          {[
            { label: 'Redirect URL', value: status?.redirectUri },
            { label: 'Post back URL (optional)', value: status?.postbackUrl },
            { label: 'Primary Static IP', value: status?.staticIp },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{row.label}</div>
                <code className="text-[11px] break-all">{row.value || '—'}</code>
              </div>
              {row.value && (
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Copy ${row.label}`}
                  onClick={() => { navigator.clipboard.writeText(row.value); toast.success(`${row.label} copied`); }}
                >
                  Copy
                </Button>
              )}
            </div>
          ))}
        </div>



        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ao-apikey">Trading API Key</Label>
            <Input
              id="ao-apikey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="SmartAPI trading app key"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ao-client">Client Code</Label>
            <Input
              id="ao-client"
              value={clientCode}
              onChange={(e) => setClientCode(e.target.value.toUpperCase())}
              placeholder="A123456"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ao-mpin">MPIN / Password</Label>
            <Input
              id="ao-mpin"
              type="password"
              value={mpin}
              onChange={(e) => setMpin(e.target.value)}
              placeholder="4-digit MPIN"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ao-totp">TOTP Secret</Label>
            <Input
              id="ao-totp"
              type="password"
              value={totpSecret}
              onChange={(e) => setTotpSecret(e.target.value)}
              placeholder="Base32 secret from SmartAPI → TOTP"
              autoComplete="new-password"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          The TOTP secret lets IndexPilot re-generate your 6-digit code automatically, so orders keep
          working without manual login during the session.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button onClick={login} disabled={busy}>
            {action === 'login' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
            {action === 'login' ? 'Connecting…' : connected ? 'Re-login' : 'Connect Angel One'}
          </Button>
          <Button variant="outline" onClick={verify} disabled={busy || !connected}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Check live funds
          </Button>
          <Button variant="outline" onClick={syncInstruments} disabled={busy}>
            {action === 'sync' || instruments?.syncing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {instruments?.syncing ? 'Syncing instruments…' : 'Sync instruments'}
          </Button>
          {connected && (
            <Button variant="ghost" onClick={disconnect} disabled={busy}>
              Disconnect
            </Button>
          )}
          <Button variant="ghost" asChild>
            <a href="https://smartapi.angelone.in/apps" target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              SmartAPI portal
            </a>
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">
          Instruments:{' '}
          {instruments?.mappedContracts
            ? `${Number(instruments.mappedContracts).toLocaleString('en-IN')} contracts · ${instruments?.freshToday ? 'updated today' : `last sync ${instruments?.lastSync?.date || '—'}`}`
            : instruments?.syncing ? 'syncing now…' : 'not synced yet'}
          {instruments?.lastSync?.expiries && (
            <span className="mt-1 block">
              {Object.entries(instruments.lastSync.expiries).map(([name, expiries]: any) => `${name}: ${expiries.join(', ')}`).join(' · ')}
            </span>
          )}
          {instruments?.syncError && <span className="mt-1 block text-destructive">Sync error: {instruments.syncError}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
