// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminGet } from '@/app/utils/adminOpsApi';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { useAdminSubTabSync } from '@/hooks/useAdminSubTabSync';
import { Activity, RefreshCw, Loader2, Download } from 'lucide-react';

const istDay = (offsetDays = 0) => {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000 - offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
};
const istRangeToUtc = (from: string, to: string) => ({
  fromIso: new Date(`${from}T00:00:00+05:30`).toISOString(),
  toIso: new Date(`${to}T23:59:59+05:30`).toISOString(),
});
const money = (n: number) =>
  `${n < 0 ? '-' : ''}₹${Math.abs(Math.round(Number(n) || 0)).toLocaleString('en-IN')}`;
const pnlClass = (n: number) => (Number(n) > 0 ? 'text-emerald-400' : Number(n) < 0 ? 'text-red-400' : 'text-slate-300');

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="bg-slate-900/60 border-slate-700/60">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
        <p className={`mt-1 text-2xl font-semibold ${tone || 'text-slate-100'}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

export function AdminPositionsOrders({ serverUrl, accessToken }: { serverUrl?: string; accessToken?: string } = {}) {
  const [sub, setSub] = useState('overview');
  useAdminSubTabSync('operations', setSub);

  const [from, setFrom] = useState(istDay());
  const [to, setTo] = useState(istDay());
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [wallet, setWallet] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await adminGet(
        `/admin/ops/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        serverUrl, accessToken,
      );
      setOrders(j.orders || []);
      setPositions(j.positions || []);
      setProfiles(j.profiles || []);
      setWallet(j.wallet || []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load operations data');
      setOrders([]); setPositions([]); setProfiles([]); setWallet([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, serverUrl, accessToken]);

  useEffect(() => { load(); }, [load]);

  const profileBy = useMemo(() => {
    const m: Record<string, any> = {};
    (profiles || []).forEach((x) => { m[x.user_id] = x; });
    return m;
  }, [profiles]);

  const totals = useMemo(() => {
    const openPos = positions.filter((x) => x.is_active);
    const closedPos = positions.filter((x) => !x.is_active);
    const pnl = positions.reduce((s, x) => s + (Number(x.pnl) || 0), 0);
    const realized = closedPos.reduce((s, x) => s + (Number(x.pnl) || 0), 0);
    const earnings = wallet.filter((x) => x.type === 'debit').reduce((s, x) => s + (Number(x.amount) || 0), 0);
    return {
      orders: orders.length,
      placed: orders.filter((x) => x.status !== 'failed').length,
      failed: orders.filter((x) => x.status === 'failed').length,
      positions: positions.length,
      open: openPos.length,
      closed: closedPos.length,
      pnl, realized, earnings,
      users: new Set([...orders.map((x) => x.user_id), ...positions.map((x) => x.user_id)]).size,
    };
  }, [orders, positions, wallet]);

  /** Per-user rollup used by the Order Count, User Details and Profit tabs. */
  const perUser = useMemo(() => {
    const map: Record<string, any> = {};
    const row = (uid: string) => {
      if (!map[uid]) {
        const pf = profileBy[uid] || {};
        map[uid] = {
          userId: uid,
          clientId: pf.client_id || '—',
          algoId: pf.client_id ? `ALGO-${String(pf.client_id).toUpperCase()}` : `ALGO-${String(uid).slice(0, 8).toUpperCase()}`,
          name: pf.full_name || '—',
          email: pf.email || '—',
          mobile: pf.mobile || '—',
          status: pf.account_status || '—',
          broker: pf.active_broker || '—',
          orders: 0, failed: 0, positions: 0, open: 0, pnl: 0, realized: 0, charges: 0,
          brokers: new Set<string>(), indices: new Set<string>(),
        };
      }
      return map[uid];
    };
    orders.forEach((o) => {
      const r = row(o.user_id);
      r.orders += 1;
      if (o.status === 'failed') r.failed += 1;
      if (o.broker) r.brokers.add(o.broker);
      if (o.index_name) r.indices.add(o.index_name);
    });
    positions.forEach((p) => {
      const r = row(p.user_id);
      r.positions += 1;
      if (p.is_active) r.open += 1;
      r.pnl += Number(p.pnl) || 0;
      if (!p.is_active) r.realized += Number(p.pnl) || 0;
    });
    wallet.filter((w) => w.type === 'debit').forEach((w) => {
      const r = row(w.user_id);
      r.charges += Number(w.amount) || 0;
    });
    return Object.values(map).sort((a: any, b: any) => b.orders - a.orders);
  }, [orders, positions, wallet, profileBy]);

  const byIndex = useMemo(() => {
    const m: Record<string, any> = {};
    orders.forEach((o) => {
      const k = o.index_name || 'OTHER';
      m[k] = m[k] || { index: k, orders: 0, failed: 0 };
      m[k].orders += 1;
      if (o.status === 'failed') m[k].failed += 1;
    });
    positions.forEach((p) => {
      const k = p.index_name || 'OTHER';
      m[k] = m[k] || { index: k, orders: 0, failed: 0 };
      m[k].pnl = (m[k].pnl || 0) + (Number(p.pnl) || 0);
    });
    return Object.values(m);
  }, [orders, positions]);

  const byBroker = useMemo(() => {
    const m: Record<string, any> = {};
    orders.forEach((o) => {
      const k = o.broker || 'unknown';
      m[k] = m[k] || { broker: k, orders: 0, failed: 0 };
      m[k].orders += 1;
      if (o.status === 'failed') m[k].failed += 1;
    });
    return Object.values(m);
  }, [orders]);

  const byDay = useMemo(() => {
    const m: Record<string, any> = {};
    const day = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
    orders.forEach((o) => {
      const k = day(o.created_at);
      m[k] = m[k] || { day: k, orders: 0, positions: 0, pnl: 0 };
      m[k].orders += 1;
    });
    positions.forEach((p) => {
      const k = day(p.created_at);
      m[k] = m[k] || { day: k, orders: 0, positions: 0, pnl: 0 };
      m[k].positions += 1;
      m[k].pnl += Number(p.pnl) || 0;
    });
    return Object.values(m).sort((a: any, b: any) => (a.day < b.day ? 1 : -1));
  }, [orders, positions]);

  const exportUsers = () => {
    const head = ['client_id', 'algo_id', 'name', 'email', 'mobile', 'broker', 'orders', 'failed', 'positions', 'open', 'pnl', 'realized', 'charges'];
    const body = perUser.map((r: any) => [r.clientId, r.algoId, r.name, r.email, r.mobile, r.broker, r.orders, r.failed, r.positions, r.open, Math.round(r.pnl), Math.round(r.realized), Math.round(r.charges)]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `positions-orders-${from}_${to}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Activity className="size-6 text-blue-400" />
        <h2 className="text-2xl font-bold text-white">Positions &amp; Orders</h2>
        <Badge className="bg-blue-500/20 text-blue-300">{totals.users} users active</Badge>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" aria-label="From date" />
          <Input type="date" value={to} min={from} max={istDay()} onChange={(e) => setTo(e.target.value)} className="w-[150px]" aria-label="To date" />
          <Button variant="outline" size="sm" onClick={() => { setFrom(istDay()); setTo(istDay()); }}>Today</Button>
          <Button variant="outline" size="sm" onClick={() => { setFrom(istDay(6)); setTo(istDay()); }}>7 days</Button>
          <Button variant="outline" size="sm" onClick={() => { setFrom(istDay(29)); setTo(istDay()); }}>30 days</Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Orders" value={String(totals.orders)} />
        <Kpi label="Positions" value={`${totals.positions} (${totals.open} open)`} />
        <Kpi label="Overall P&L" value={money(totals.pnl)} tone={pnlClass(totals.pnl)} />
        <Kpi label="Platform earnings" value={money(totals.earnings)} tone="text-emerald-400" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-slate-400">
          <Loader2 className="size-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <Tabs value={sub} onValueChange={setSub}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="orders">Order Count</TabsTrigger>
            <TabsTrigger value="users">User Details</TabsTrigger>
            <TabsTrigger value="profit">Profit Earned</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Orders placed" value={String(totals.placed)} tone="text-emerald-400" />
              <Kpi label="Orders failed" value={String(totals.failed)} tone="text-red-400" />
              <Kpi label="Closed positions" value={String(totals.closed)} />
              <Kpi label="Realized P&L" value={money(totals.realized)} tone={pnlClass(totals.realized)} />
            </div>
            <Card className="bg-slate-900/60 border-slate-700/60">
              <CardHeader><CardTitle className="text-base text-slate-200">Day wise</CardTitle></CardHeader>
              <CardContent className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date (IST)</TableHead><TableHead>Orders</TableHead><TableHead>Positions</TableHead><TableHead>P&L</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {byDay.map((d: any) => (
                      <TableRow key={d.day}>
                        <TableCell>{d.day}</TableCell>
                        <TableCell>{d.orders}</TableCell>
                        <TableCell>{d.positions}</TableCell>
                        <TableCell className={pnlClass(d.pnl)}>{money(d.pnl)}</TableCell>
                      </TableRow>
                    ))}
                    {!byDay.length && <TableRow><TableCell colSpan={4} className="text-center text-slate-500 py-6">No activity</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders" className="space-y-4 pt-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="bg-slate-900/60 border-slate-700/60">
                <CardHeader><CardTitle className="text-base text-slate-200">By index</CardTitle></CardHeader>
                <CardContent className="overflow-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Index</TableHead><TableHead>Orders</TableHead><TableHead>Failed</TableHead><TableHead>P&L</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {byIndex.map((r: any) => (
                        <TableRow key={r.index}>
                          <TableCell>{r.index}</TableCell><TableCell>{r.orders}</TableCell>
                          <TableCell className="text-red-400">{r.failed}</TableCell>
                          <TableCell className={pnlClass(r.pnl || 0)}>{money(r.pnl || 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card className="bg-slate-900/60 border-slate-700/60">
                <CardHeader><CardTitle className="text-base text-slate-200">By broker</CardTitle></CardHeader>
                <CardContent className="overflow-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Broker</TableHead><TableHead>Orders</TableHead><TableHead>Failed</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {byBroker.map((r: any) => (
                        <TableRow key={r.broker}>
                          <TableCell className="uppercase">{r.broker}</TableCell><TableCell>{r.orders}</TableCell>
                          <TableCell className="text-red-400">{r.failed}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
            <Card className="bg-slate-900/60 border-slate-700/60">
              <CardHeader><CardTitle className="text-base text-slate-200">Order count per user</CardTitle></CardHeader>
              <CardContent className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Client ID</TableHead><TableHead>Algo ID</TableHead><TableHead>Name</TableHead>
                    <TableHead>Orders</TableHead><TableHead>Failed</TableHead><TableHead>Brokers</TableHead><TableHead>Indices</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {perUser.map((r: any) => (
                      <TableRow key={r.userId}>
                        <TableCell className="font-mono text-xs">{r.clientId}</TableCell>
                        <TableCell className="font-mono text-xs">{r.algoId}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>{r.orders}</TableCell>
                        <TableCell className="text-red-400">{r.failed}</TableCell>
                        <TableCell className="text-xs uppercase">{Array.from(r.brokers).join(', ') || '—'}</TableCell>
                        <TableCell className="text-xs">{Array.from(r.indices).join(', ') || '—'}</TableCell>
                      </TableRow>
                    ))}
                    {!perUser.length && <TableRow><TableCell colSpan={7} className="text-center text-slate-500 py-6">No orders</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-4 pt-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" className="gap-2" onClick={exportUsers}><Download className="size-4" /> Export CSV</Button>
            </div>
            <Card className="bg-slate-900/60 border-slate-700/60">
              <CardContent className="overflow-auto p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Client ID</TableHead><TableHead>Algo ID</TableHead><TableHead>Name</TableHead><TableHead>Email</TableHead>
                    <TableHead>Mobile</TableHead><TableHead>Broker</TableHead><TableHead>Status</TableHead>
                    <TableHead>Orders</TableHead><TableHead>Open</TableHead><TableHead>P&L</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {perUser.map((r: any) => (
                      <TableRow key={r.userId}>
                        <TableCell className="font-mono text-xs">{r.clientId}</TableCell>
                        <TableCell className="font-mono text-xs">{r.algoId}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell className="text-xs">{r.email}</TableCell>
                        <TableCell className="text-xs">{r.mobile}</TableCell>
                        <TableCell className="text-xs uppercase">{r.broker}</TableCell>
                        <TableCell className="text-xs">{r.status}</TableCell>
                        <TableCell>{r.orders}</TableCell>
                        <TableCell>{r.open}</TableCell>
                        <TableCell className={pnlClass(r.pnl)}>{money(r.pnl)}</TableCell>
                      </TableRow>
                    ))}
                    {!perUser.length && <TableRow><TableCell colSpan={10} className="text-center text-slate-500 py-6">No users active in this range</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="profit" className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Kpi label="User net P&L" value={money(totals.pnl)} tone={pnlClass(totals.pnl)} />
              <Kpi label="Realized P&L" value={money(totals.realized)} tone={pnlClass(totals.realized)} />
              <Kpi label="Platform earnings (charges)" value={money(totals.earnings)} tone="text-emerald-400" />
            </div>
            <Card className="bg-slate-900/60 border-slate-700/60">
              <CardHeader><CardTitle className="text-base text-slate-200">Profit earned per user</CardTitle></CardHeader>
              <CardContent className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Client ID</TableHead><TableHead>Name</TableHead><TableHead>Positions</TableHead>
                    <TableHead>Realized</TableHead><TableHead>Net P&L</TableHead><TableHead>Charges billed</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {[...perUser].sort((a: any, b: any) => b.pnl - a.pnl).map((r: any) => (
                      <TableRow key={r.userId}>
                        <TableCell className="font-mono text-xs">{r.clientId}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>{r.positions}</TableCell>
                        <TableCell className={pnlClass(r.realized)}>{money(r.realized)}</TableCell>
                        <TableCell className={pnlClass(r.pnl)}>{money(r.pnl)}</TableCell>
                        <TableCell className="text-slate-300">{money(r.charges)}</TableCell>
                      </TableRow>
                    ))}
                    {!perUser.length && <TableRow><TableCell colSpan={6} className="text-center text-slate-500 py-6">No data</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

export default AdminPositionsOrders;
