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
      setMpin('');
      await load();
      onConnected?.();
    } catch (e: any) {
      toast.error(e.message || 'Angel One login failed');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    try {
      setBusy(true);
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
    }
  };

  const syncInstruments = async () => {
    try {
      setBusy(true);
      const t = await tok();
      const res = await fetchWithAuth(`${serverUrl}/broker/angelone/instruments/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ force: true, expiries: 2 }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Instrument sync failed');
      toast.success(`Synced ${data?.merged ?? data?.count ?? 0} Angel One contracts`);
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Instrument sync failed');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    try {
      setBusy(true);
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
    }
  };

  const connected = !!status?.connected;

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
            <LogIn className="mr-2 h-4 w-4" />
            {connected ? 'Re-login' : 'Connect Angel One'}
          </Button>
          <Button variant="outline" onClick={verify} disabled={busy || !connected}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Check live funds
          </Button>
          <Button variant="outline" onClick={syncInstruments} disabled={busy}>
            <Download className="mr-2 h-4 w-4" />
            Sync instruments
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
          {instruments?.count
            ? `${instruments.count} contracts · updated ${instruments?.updatedAt || instruments?.date || '—'}`
            : 'not synced yet'}
        </div>
      </CardContent>
    </Card>
  );
}
