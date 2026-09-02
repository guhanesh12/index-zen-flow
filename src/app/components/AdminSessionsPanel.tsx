// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Loader2, RefreshCw, Clock, UserCheck, Download } from 'lucide-react';

const FN_BASE =
  (import.meta as any).env?.VITE_SUPABASE_URL
    ? `${(import.meta as any).env.VITE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/make-server-c4d79cb7`
    : 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7';

/** Admin check-in / check-out report: login time, logout time, duration, online state. */
export function AdminSessionsPanel({ accessToken }: { accessToken: string }) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [onlyOnline, setOnlyOnline] = useState(false);

  const token = accessToken || sessionStorage.getItem('admin_access_token') || '';

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', new Date(from).toISOString());
      if (to) params.set('to', new Date(`${to}T23:59:59`).toISOString());
      const res = await fetch(`${FN_BASE}/admin/sessions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      setSessions(data?.sessions || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sessions.filter((s) => {
      if (onlyOnline && !s.online) return false;
      if (!needle) return true;
      return JSON.stringify(s).toLowerCase().includes(needle);
    });
  }, [sessions, q, onlyOnline]);

  const onlineCount = sessions.filter((s) => s.online).length;
  const totalMinutes = visible.reduce((a, s) => a + (s.duration_minutes || 0), 0);

  const fmtDuration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

  const exportCsv = () => {
    const head = ['admin', 'email', 'hotkey', 'check_in', 'check_out', 'duration_min', 'online', 'ip', 'device', 'browser'];
    const body = visible.map((s) => [
      s.admin_name || '', s.admin_email || '', s.hotkey || '',
      new Date(s.login_at).toISOString(), s.logout_at ? new Date(s.logout_at).toISOString() : '',
      s.duration_minutes, s.online ? 'yes' : 'no', s.ip_address || '', s.device || '', s.browser || '',
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `admin-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Clock className="size-6 text-blue-400" />
        <h2 className="text-2xl font-bold text-white">Admin Sessions</h2>
        <Badge className="bg-green-500/20 text-green-400">{onlineCount} online</Badge>
        <Badge className="bg-slate-500/20 text-slate-300">{visible.length} sessions</Badge>
        <Badge className="bg-blue-500/20 text-blue-300">Total {fmtDuration(totalMinutes)}</Badge>
      </div>

      <Card className="bg-slate-900/60 border-blue-500/20 p-4 space-y-3">
        <div className="grid gap-2 md:grid-cols-5">
          <Input className="md:col-span-2" placeholder="Search admin, email, IP…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" className="gap-2"><RefreshCw className="size-4" /> Apply</Button>
            <Button onClick={exportCsv} variant="outline" className="gap-2"><Download className="size-4" /> CSV</Button>
          </div>
        </div>
        <label className="flex w-fit items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={onlyOnline} onChange={(e) => setOnlyOnline(e.target.checked)} />
          Show online admins only
        </label>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader2 className="size-5 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admin</TableHead>
                  <TableHead>Hotkey</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Device</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">
                      <div className="font-medium text-white">{s.admin_name || '—'}</div>
                      <div className="text-slate-400">{s.admin_email}</div>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{s.hotkey || '—'}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(s.login_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{s.logout_at ? new Date(s.logout_at).toLocaleString() : '—'}</TableCell>
                    <TableCell className="text-xs">{fmtDuration(s.duration_minutes || 0)}</TableCell>
                    <TableCell>
                      {s.online
                        ? <Badge className="bg-green-500/20 text-green-400 gap-1"><UserCheck className="size-3" /> Online</Badge>
                        : <Badge className="bg-slate-500/20 text-slate-300">Offline</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-slate-400">{s.login_method}</TableCell>
                    <TableCell className="text-xs text-slate-400">{s.ip_address || '—'}</TableCell>
                    <TableCell className="text-xs text-slate-400">{[s.device, s.browser].filter(Boolean).join(' · ') || '—'}</TableCell>
                  </TableRow>
                ))}
                {!visible.length && (
                  <TableRow><TableCell colSpan={9} className="py-6 text-center text-slate-500">No sessions</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default AdminSessionsPanel;
