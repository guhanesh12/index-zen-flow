// Admin Access Control: IP allowlist + geo-block + auto-suspend alert email
// Lives at: src/app/components/AdminAccessControl.tsx
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/utils-ext/supabase/client';
import { Shield, Trash2, Plus, Globe, Mail, AlertTriangle } from 'lucide-react';

interface Config {
  id: number;
  ip_allowlist_enabled: boolean;
  geo_restrict_enabled: boolean;
  allowed_countries: string[];
  alert_email: string | null;
  alert_on_auto_suspend: boolean;
  alert_on_critical_event: boolean;
}

interface IpRow { id: string; ip_address: string; label: string | null; created_at: string }
interface LogRow { id: string; ip_address: string | null; country_code: string | null; allowed: boolean; reason: string | null; email: string | null; created_at: string }

const getAdminSessionCode = () => {
  try {
    const adminRaw = sessionStorage.getItem('admin_user');
    if (adminRaw) {
      const admin = JSON.parse(adminRaw);
      if (admin?.uniqueCode) return String(admin.uniqueCode);
    }
    const match = window.location.pathname.match(/\/admin\/hotkey\/([^/]+)/);
    return match?.[1] || sessionStorage.getItem('admin_unique_code') || '';
  } catch {
    return sessionStorage.getItem('admin_unique_code') || '';
  }
};

const callAdminSecurity = (body: Record<string, unknown>) => {
  const sessionCode = getAdminSessionCode();
  const accessToken = sessionStorage.getItem('admin_access_token');
  return supabase.functions.invoke('admin-security-manage', {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: {
      url_key: sessionCode,
      admin_code: sessionCode,
      ...body,
    },
  });
};

export function AdminAccessControl() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [ips, setIps] = useState<IpRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newIp, setNewIp] = useState('');
  const [newIpLabel, setNewIpLabel] = useState('');
  const [myIp, setMyIp] = useState<string | null>(null);
  const [countriesInput, setCountriesInput] = useState('IN');

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await callAdminSecurity({ action: 'load' });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      const d = data as { cfg: Config; ips: IpRow[]; logs: LogRow[] };
      if (d.cfg) { setCfg(d.cfg); setCountriesInput((d.cfg.allowed_countries ?? ['IN']).join(',')); }
      setIps(d.ips ?? []);
      setLogs(d.logs ?? []);
    } catch (e: any) {
      toast.error('Failed to load access controls: ' + (e?.message ?? 'unknown'));
      // Fallback so UI still renders
      setCfg({
        id: 1,
        ip_allowlist_enabled: false,
        geo_restrict_enabled: false,
        allowed_countries: ['IN'],
        alert_email: null,
        alert_on_auto_suspend: true,
        alert_on_critical_event: true,
      });
    } finally {
      setLoading(false);
    }
    // Best-effort fetch current public IP
    try {
      const r = await fetch('https://api.ipify.org?format=json');
      const j = await r.json();
      setMyIp(j?.ip ?? null);
    } catch { /* ignore */ }
  }

  useEffect(() => { load(); }, []);

  async function saveConfig(patch: Partial<Config>) {
    if (!cfg) return;
    setSaving(true);
    const { data, error } = await callAdminSecurity({ action: 'save_config', patch });
    setSaving(false);
    if (error || (data as any)?.error) {
      toast.error('Failed to save: ' + (error?.message ?? (data as any)?.error));
      return;
    }
    setCfg((data as any).cfg as Config);
    toast.success('Saved');
  }

  async function addIp(ip: string, label?: string) {
    const v = ip.trim();
    if (!v) return;
    const { data, error } = await callAdminSecurity({ action: 'add_ip', ip: v, label: label?.trim() || null });
    if (error || (data as any)?.error) { toast.error(error?.message ?? (data as any)?.error); return; }
    setNewIp(''); setNewIpLabel('');
    toast.success('IP added to allowlist');
    load();
  }

  async function removeIp(id: string) {
    const { data, error } = await callAdminSecurity({ action: 'remove_ip', id });
    if (error || (data as any)?.error) { toast.error(error?.message ?? (data as any)?.error); return; }
    toast.success('Removed'); load();
  }


  async function sendTestAlert() {
    if (!cfg?.alert_email) { toast.error('Set alert email first'); return; }
    const { data, error } = await supabase.functions.invoke('send-security-alert', {
      body: {
        to: cfg.alert_email,
        subject: '[IndexPilot Security] Test alert',
        event: 'test_alert',
        severity: 'info',
        details: { triggered_by: 'admin', time: new Date().toISOString() },
      },
    });
    if (error || (data as any)?.error) { toast.error('Failed: ' + (error?.message ?? (data as any)?.error)); return; }
    toast.success('Test alert sent — check your inbox');
  }

  if (loading || !cfg) return <div className="text-sm text-muted-foreground p-6">Loading access controls…</div>;

  return (
    <div className="space-y-6">
      {/* Banner */}
      <Card className="border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20">
        <CardContent className="p-4 flex gap-3 items-start">
          <AlertTriangle className="size-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <strong>Bank-level admin protection.</strong> Combine 2FA + IP allowlist + geo-block for maximum security.
            Add your IP <strong>before</strong> enabling the allowlist or you will lock yourself out.
            {myIp && <> Your current public IP: <code className="px-1.5 py-0.5 rounded bg-muted">{myIp}</code></>}
          </div>
        </CardContent>
      </Card>

      {/* Auto-suspend email alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="size-4" /> Security Email Alerts</CardTitle>
          <CardDescription>Get emailed whenever an account is auto-suspended or a critical event fires.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-[1fr_auto] gap-3">
            <div>
              <Label htmlFor="alert-email">Alert email</Label>
              <Input id="alert-email" type="email" value={cfg.alert_email ?? ''} onChange={e => setCfg({ ...cfg, alert_email: e.target.value })} placeholder="security@example.com" />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={() => saveConfig({ alert_email: cfg.alert_email })} disabled={saving}>Save</Button>
              <Button variant="outline" onClick={sendTestAlert}>Send test</Button>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div><div className="font-medium text-sm">Alert on auto-suspend</div><div className="text-xs text-muted-foreground">Triggered after 10 failed logins in 15 min.</div></div>
            <Switch checked={cfg.alert_on_auto_suspend} onCheckedChange={v => saveConfig({ alert_on_auto_suspend: v })} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div><div className="font-medium text-sm">Alert on critical security events</div><div className="text-xs text-muted-foreground">Manual suspensions, role changes, etc.</div></div>
            <Switch checked={cfg.alert_on_critical_event} onCheckedChange={v => saveConfig({ alert_on_critical_event: v })} />
          </div>
        </CardContent>
      </Card>

      {/* IP allowlist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="size-4" /> IP Allowlist</CardTitle>
          <CardDescription>Only allowlisted IPs can reach the admin panel when enabled.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="font-medium text-sm">Enforce IP allowlist</div>
              <div className="text-xs text-muted-foreground">When ON, all admin access from non-listed IPs is blocked.</div>
            </div>
            <Switch
              checked={cfg.ip_allowlist_enabled}
              onCheckedChange={v => {
                if (v && ips.length === 0) { toast.error('Add at least one IP first'); return; }
                saveConfig({ ip_allowlist_enabled: v });
              }}
            />
          </div>

          <div className="grid sm:grid-cols-[1fr_1fr_auto_auto] gap-2">
            <Input placeholder="192.0.2.10" value={newIp} onChange={e => setNewIp(e.target.value)} />
            <Input placeholder="Label (Home, Office…)" value={newIpLabel} onChange={e => setNewIpLabel(e.target.value)} />
            <Button onClick={() => addIp(newIp, newIpLabel)}><Plus className="size-4 mr-1" />Add</Button>
            {myIp && <Button variant="outline" onClick={() => addIp(myIp, 'My current IP')}>Add my IP ({myIp})</Button>}
          </div>

          <div className="border rounded-md divide-y">
            {ips.length === 0 && <div className="p-4 text-sm text-muted-foreground">No IPs in allowlist.</div>}
            {ips.map(ip => (
              <div key={ip.id} className="flex items-center justify-between p-3">
                <div>
                  <div className="font-mono text-sm">{ip.ip_address}</div>
                  {ip.label && <div className="text-xs text-muted-foreground">{ip.label}</div>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => removeIp(ip.id)}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Geo block */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="size-4" /> Geo-Block (Country Whitelist)</CardTitle>
          <CardDescription>Block admin login from countries outside this list. Uses ISO 3166-1 alpha-2 codes (e.g. IN, US, AE).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="font-medium text-sm">Enforce country whitelist</div>
              <div className="text-xs text-muted-foreground">Currently allowed: {cfg.allowed_countries.join(', ') || '—'}</div>
            </div>
            <Switch checked={cfg.geo_restrict_enabled} onCheckedChange={v => saveConfig({ geo_restrict_enabled: v })} />
          </div>
          <div className="grid sm:grid-cols-[1fr_auto] gap-2">
            <Input value={countriesInput} onChange={e => setCountriesInput(e.target.value.toUpperCase())} placeholder="IN,US,AE" />
            <Button onClick={() => {
              const arr = countriesInput.split(',').map(s => s.trim()).filter(s => /^[A-Z]{2}$/.test(s));
              if (arr.length === 0) { toast.error('Enter at least one 2-letter country code'); return; }
              saveConfig({ allowed_countries: arr });
            }}>Save countries</Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent access log */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Admin Access Attempts</CardTitle>
          <CardDescription>Last 50 attempts — both allowed and denied.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md divide-y max-h-96 overflow-auto">
            {logs.length === 0 && <div className="p-4 text-sm text-muted-foreground">No attempts logged yet.</div>}
            {logs.map(l => (
              <div key={l.id} className="flex items-center justify-between p-3 text-sm">
                <div className="space-y-0.5">
                  <div className="font-mono">{l.ip_address || 'unknown'} {l.country_code && <span className="ml-1 text-muted-foreground">[{l.country_code}]</span>}</div>
                  <div className="text-xs text-muted-foreground">{l.email ?? '—'} · {new Date(l.created_at).toLocaleString()}</div>
                  {l.reason && <div className="text-xs text-muted-foreground">{l.reason}</div>}
                </div>
                <Badge variant={l.allowed ? 'secondary' : 'destructive'}>{l.allowed ? 'Allowed' : 'Blocked'}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminAccessControl;
