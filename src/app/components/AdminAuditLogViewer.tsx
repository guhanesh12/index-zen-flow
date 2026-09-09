// @ts-nocheck
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Loader2, RefreshCw, ScrollText } from 'lucide-react';

export function AdminAuditLogViewer() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    let query = supabase.from('admin_audit_events').select('*').order('created_at', { ascending: false }).limit(500);
    if (q) query = query.or(`action.ilike.%${q}%,module.ilike.%${q}%,actor_email.ilike.%${q}%`);
    const { data } = await query;
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const badge = (s: string) => {
    if (s === 'success') return 'bg-green-500/20 text-green-400';
    if (s === 'failed' || s === 'blocked') return 'bg-red-500/20 text-red-400';
    return 'bg-slate-500/20 text-slate-300';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ScrollText className="size-6 text-blue-400" />
        <h2 className="text-2xl font-bold text-white">Admin Audit Log</h2>
      </div>
      <Card className="bg-slate-900/60 border-blue-500/20 p-4 space-y-3">
        <div className="flex gap-2">
          <Input placeholder="Search action, module, email…" value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()} />
          <Button onClick={load} variant="outline"><RefreshCw className="size-4" /></Button>
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
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{r.actor_email || r.actor_user_id?.slice(0, 8) || '—'}</TableCell>
                    <TableCell className="text-xs font-mono">{r.action}</TableCell>
                    <TableCell className="text-xs">{r.module || '—'}</TableCell>
                    <TableCell><Badge className={badge(r.status)}>{r.status || 'success'}</Badge></TableCell>
                    <TableCell className="text-xs text-slate-400">{r.ip_address || '—'}</TableCell>
                  </TableRow>
                ))}
                {!rows.length && (
                  <TableRow><TableCell colSpan={6} className="text-center text-slate-500 py-6">No events</TableCell></TableRow>
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
