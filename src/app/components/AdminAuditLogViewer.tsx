// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Loader2, RefreshCw, ScrollText, ChevronDown, ChevronRight, Download } from 'lucide-react';

/**
 * Full admin footprint viewer — every mutating admin request is captured by the
 * server-side audit middleware, so this shows *who* did *what*, to *which user*,
 * from *which device / IP*, and whether it succeeded or was blocked.
 */
export function AdminAuditLogViewer() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    let query = supabase.from('admin_audit_events').select('*').order('created_at', { ascending: false }).limit(1000);
    if (q) query = query.or(`action.ilike.%${q}%,module.ilike.%${q}%,actor_email.ilike.%${q}%,target_resource.ilike.%${q}%`);
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (from) query = query.gte('created_at', new Date(from).toISOString());
    if (to) query = query.lte('created_at', new Date(`${to}T23:59:59`).toISOString());
    const { data } = await query;
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const modules = useMemo(
    () => Array.from(new Set(rows.map((r) => r.module).filter(Boolean))).sort(),
    [rows],
  );
  const visible = useMemo(
    () => (moduleFilter === 'all' ? rows : rows.filter((r) => r.module === moduleFilter)),
    [rows, moduleFilter],
  );

  const badge = (s: string) => {
    if (s === 'success') return 'bg-green-500/20 text-green-400';
    if (s === 'failed' || s === 'blocked') return 'bg-red-500/20 text-red-400';
    return 'bg-slate-500/20 text-slate-300';
  };

  const exportCsv = () => {
    const head = ['when', 'actor', 'action', 'module', 'target', 'status', 'ip', 'device', 'browser'];
    const body = visible.map((r) => [
      new Date(r.created_at).toISOString(), r.actor_email || r.actor_user_id || '',
      r.action, r.module || '', r.target_user_id || r.target_resource || '',
      r.status, r.ip_address || '', r.device || '', r.browser || '',
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `admin-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ScrollText className="size-6 text-blue-400" />
        <h2 className="text-2xl font-bold text-white">Admin Audit Log</h2>
        <Badge className="bg-blue-500/20 text-blue-300">{visible.length} events</Badge>
      </div>

      <Card className="bg-slate-900/60 border-blue-500/20 p-4 space-y-3">
        <div className="grid gap-2 md:grid-cols-6">
          <Input className="md:col-span-2" placeholder="Search action, module, admin, target…" value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
          <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-200">
            <option value="all">All modules</option>
            {modules.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-200">
            <option value="all">All statuses</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="blocked">Blocked</option>
          </select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        </div>
        <div className="flex gap-2">
          <Button onClick={load} variant="outline" className="gap-2"><RefreshCw className="size-4" /> Apply</Button>
          <Button onClick={exportCsv} variant="outline" className="gap-2"><Download className="size-4" /> Export CSV</Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader2 className="size-5 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>When</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Target user</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Device</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => (
                  <>
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                      <TableCell>{expanded === r.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{r.actor_email || r.actor_user_id?.slice(0, 8) || '—'}</TableCell>
                      <TableCell className="text-xs font-mono">{r.action}</TableCell>
                      <TableCell className="text-xs">{r.module || '—'}</TableCell>
                      <TableCell className="text-xs font-mono">{(r.target_user_id || r.target_resource || '—').toString().slice(0, 14)}</TableCell>
                      <TableCell><Badge className={badge(r.status)}>{r.status || 'success'}</Badge></TableCell>
                      <TableCell className="text-xs text-slate-400">{r.ip_address || '—'}</TableCell>
                      <TableCell className="text-xs text-slate-400">{[r.device, r.browser].filter(Boolean).join(' · ') || '—'}</TableCell>
                    </TableRow>
                    {expanded === r.id && (
                      <TableRow key={`${r.id}-d`}>
                        <TableCell colSpan={9} className="bg-slate-950/70">
                          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] text-slate-300">
{JSON.stringify(r.details || {}, null, 2)}
                          </pre>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
                {!visible.length && (
                  <TableRow><TableCell colSpan={9} className="text-center text-slate-500 py-6">No events</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default AdminAuditLogViewer;
