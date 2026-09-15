// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { ScrollText, RefreshCw, Loader2, ChevronDown, ChevronRight, Download } from 'lucide-react';

const money = (n: any) => (n === null || n === undefined || n === '' ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
const ist = (iso: string) => (iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—');
const statusTone = (s: string) =>
  s === 'failed' || s === 'blocked' ? 'bg-red-500/20 text-red-300'
    : s === 'placed' || s === 'success' || s === 'complete' ? 'bg-emerald-500/20 text-emerald-300'
      : 'bg-slate-600/30 text-slate-300';

export function AdminOrderLogs() {
  const [rows, setRows] = useState<any[]>([]);
  const [signals, setSignals] = useState<Record<string, any>>({});
  const [audits, setAudits] = useState<Record<string, any[]>>({});
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [broker, setBroker] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('trading_orders').select('*').order('created_at', { ascending: false }).limit(500);
    if (status !== 'all') query = query.eq('status', status);
    if (broker !== 'all') query = query.eq('broker', broker);
    const { data: orders } = await query;
    const list = orders || [];
    setRows(list);

    const signalIds = Array.from(new Set(list.map((o) => o.signal_id).filter(Boolean)));
    const signalCodes = Array.from(new Set(list.map((o) => o.signal_code).filter(Boolean)));
    const orderCodes = Array.from(new Set(list.map((o) => o.order_code).filter(Boolean)));
    const userIds = Array.from(new Set(list.map((o) => o.user_id).filter(Boolean)));

    const [sigById, sigByCode, auditRes, profRes] = await Promise.all([
      signalIds.length ? supabase.from('trading_signals').select('*').in('id', signalIds) : Promise.resolve({ data: [] }),
      signalCodes.length ? supabase.from('trading_signals').select('*').in('signal_code', signalCodes) : Promise.resolve({ data: [] }),
      orderCodes.length ? supabase.from('order_audit_events').select('*').in('order_code', orderCodes).order('created_at', { ascending: true }) : Promise.resolve({ data: [] }),
      userIds.length ? supabase.from('profiles').select('user_id, client_id, full_name, email').in('user_id', userIds) : Promise.resolve({ data: [] }),
    ]);

    const sig: Record<string, any> = {};
    [...(sigById.data || []), ...(sigByCode.data || [])].forEach((s) => {
      sig[s.id] = s;
      if (s.signal_code) sig[s.signal_code] = s;
    });
    setSignals(sig);

    const ax: Record<string, any[]> = {};
    (auditRes.data || []).forEach((a) => {
      if (!a.order_code) return;
      (ax[a.order_code] = ax[a.order_code] || []).push(a);
    });
    setAudits(ax);

    const pm: Record<string, any> = {};
    (profRes.data || []).forEach((p) => { pm[p.user_id] = p; });
    setProfiles(pm);
    setLoading(false);
  }, [status, broker]);

  useEffect(() => { load(); }, [load]);

  const brokers = useMemo(() => Array.from(new Set(rows.map((r) => r.broker).filter(Boolean))).sort(), [rows]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => {
      const p = profiles[r.user_id] || {};
      return [r.order_code, r.signal_code, r.dhan_order_id, r.symbol, r.index_name, r.algo_id, r.strategy_id, p.client_id, p.email, p.full_name]
        .some((v) => String(v || '').toLowerCase().includes(term));
    });
  }, [rows, q, profiles]);

  const exportCsv = () => {
    const head = ['time_ist', 'order_code', 'signal_code', 'strategy_id', 'algo_id', 'client_id', 'broker', 'index', 'symbol', 'side', 'qty', 'average_price', 'status', 'broker_order_id'];
    const body = visible.map((r) => {
      const p = profiles[r.user_id] || {};
      return [ist(r.created_at), r.order_code, r.signal_code, r.strategy_id, r.algo_id, p.client_id, r.broker, r.index_name, r.symbol,
        r.transaction_type, r.quantity, r.average_price ?? r.price, r.status, r.dhan_order_id]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
    });
    const blob = new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `order-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ScrollText className="size-6 text-blue-400" />
        <h2 className="text-2xl font-bold text-white">Order Logs</h2>
        <Badge className="bg-blue-500/20 text-blue-300">{visible.length} orders</Badge>
      </div>

      <Card className="bg-slate-900/60 border-slate-700/60 p-4 space-y-3">
        <div className="grid gap-2 md:grid-cols-5">
          <Input className="md:col-span-2" placeholder="Search order id, signal id, algo id, client, symbol…"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-200">
            <option value="all">All statuses</option>
            <option value="placed">Placed</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>
          <select value={broker} onChange={(e) => setBroker(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-200">
            <option value="all">All brokers</option>
            {brokers.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={load} disabled={loading}>
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button variant="outline" className="gap-2" onClick={exportCsv}><Download className="size-4" /> CSV</Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 className="size-5 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Date / time (IST)</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Signal ID</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead>Algo ID</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Broker</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Avg price</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => {
                  const p = profiles[r.user_id] || {};
                  const sig = signals[r.signal_code] || signals[r.signal_id];
                  const isOpen = expanded === r.id;
                  return (
                    <>
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => setExpanded(isOpen ? null : r.id)}>
                        <TableCell>{isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{ist(r.created_at)}</TableCell>
                        <TableCell className="font-mono text-[11px]">{r.order_code || r.dhan_order_id || '—'}</TableCell>
                        <TableCell className="font-mono text-[11px] text-blue-300">{r.signal_code || (r.signal_id ? String(r.signal_id).slice(0, 8) : '—')}</TableCell>
                        <TableCell className="font-mono text-[11px]">{r.strategy_id || '—'}</TableCell>
                        <TableCell className="font-mono text-[11px]">{r.algo_id || '—'}</TableCell>
                        <TableCell className="text-xs">{p.client_id || String(r.user_id).slice(0, 8)}</TableCell>
                        <TableCell className="text-xs uppercase">{r.broker || '—'}</TableCell>
                        <TableCell className="text-xs">{r.symbol}</TableCell>
                        <TableCell className="text-xs">{r.transaction_type}</TableCell>
                        <TableCell className="text-xs">{r.quantity}</TableCell>
                        <TableCell className="text-xs">{money(r.average_price ?? r.price)}</TableCell>
                        <TableCell><Badge className={statusTone(r.status)}>{r.status}</Badge></TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow key={`${r.id}-d`}>
                          <TableCell colSpan={13} className="bg-slate-950/70">
                            <div className="grid gap-4 lg:grid-cols-3 p-2">
                              <div>
                                <p className="mb-1 text-xs font-semibold uppercase text-slate-400">Signal details</p>
                                {sig ? (
                                  <ul className="space-y-1 text-xs text-slate-300">
                                    <li>Signal ID: <span className="font-mono text-blue-300">{sig.signal_code || sig.id}</span></li>
                                    <li>Type: {sig.signal_type} · {sig.option_type || '—'}</li>
                                    <li>Index: {sig.index_name} · Strike {sig.strike_price ?? '—'}</li>
                                    <li>Price: {money(sig.price)} · Confidence {sig.confidence ?? '—'}</li>
                                    <li>Expiry: {sig.expiry || '—'}</li>
                                    <li>Generated: {ist(sig.created_at)}</li>
                                    <li>Strategy: {sig.strategy_id || '—'} · Algo {sig.algo_id || '—'}</li>
                                  </ul>
                                ) : <p className="text-xs text-slate-500">No linked signal record.</p>}
                              </div>
                              <div>
                                <p className="mb-1 text-xs font-semibold uppercase text-slate-400">Order details</p>
                                <ul className="space-y-1 text-xs text-slate-300">
                                  <li>Order ID: <span className="font-mono">{r.order_code || '—'}</span></li>
                                  <li>Broker order: <span className="font-mono">{r.dhan_order_id || '—'}</span></li>
                                  <li>Segment: {r.exchange_segment || '—'} · Security {r.symbol_id || '—'}</li>
                                  <li>Order type: {r.order_type} · {r.transaction_type}</li>
                                  <li>Qty {r.quantity} · Avg {money(r.average_price ?? r.price)}</li>
                                  <li>Status: {r.status} {r.error_message ? `· ${r.error_message}` : ''}</li>
                                  <li>User: {p.full_name || '—'} ({p.email || '—'})</li>
                                </ul>
                              </div>
                              <div>
                                <p className="mb-1 text-xs font-semibold uppercase text-slate-400">Audit trail</p>
                                {(audits[r.order_code] || []).length ? (
                                  <ul className="space-y-1 text-xs text-slate-300">
                                    {(audits[r.order_code] || []).map((a) => (
                                      <li key={a.id}>
                                        <span className="text-slate-500">{ist(a.created_at)}</span> · {a.event} ·{' '}
                                        <span className={a.status === 'success' ? 'text-emerald-400' : 'text-red-400'}>{a.status}</span>
                                        {a.message ? ` · ${a.message}` : ''}
                                      </li>
                                    ))}
                                  </ul>
                                ) : <p className="text-xs text-slate-500">No audit events recorded for this order.</p>}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
                {!visible.length && <TableRow><TableCell colSpan={13} className="text-center text-slate-500 py-6">No orders</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default AdminOrderLogs;
