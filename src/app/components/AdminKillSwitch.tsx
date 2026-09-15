// @ts-nocheck
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { toast } from 'sonner';
import { Power, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';

const GLOBAL_SWITCHES: Array<[string, string, string]> = [
  ['trading_enabled', 'All user activity', 'Master switch — off blocks signals, orders, broker connect, strategy start and backtests for everyone.'],
  ['new_signals_enabled', 'New signals', 'Engine stops publishing new BUY CALL / BUY PUT signals. Open positions keep running.'],
  ['new_orders_enabled', 'New orders', 'No fresh entry orders are sent to any broker. Exits stay allowed.'],
  ['broker_connect_enabled', 'Broker connection', 'Users cannot connect or reconnect a broker account.'],
  ['strategy_creation_enabled', 'Strategy creation / engine start', 'Users cannot create a strategy or start the engine.'],
  ['backtest_enabled', 'Backtest', 'Backtesting is switched off for all users.'],
];

export function AdminKillSwitch() {
  const [cfg, setCfg] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [k, u, p] = await Promise.all([
      supabase.from('kill_switch_config').select('*').eq('id', 1).maybeSingle(),
      supabase.from('user_kill_switch').select('*'),
      supabase.from('profiles').select('user_id, client_id, full_name, email, account_status').limit(2000),
    ]);
    setCfg(k.data || { id: 1 });
    setUsers(u.data || []);
    setProfiles(p.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggleGlobal = async (key: string, value: boolean) => {
    setCfg((p: any) => ({ ...p, [key]: value }));
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('kill_switch_config')
      .upsert({ id: 1, ...cfg, [key]: value, updated_by: auth?.user?.id || null, updated_at: new Date().toISOString() });
    if (error) { toast.error(error.message); load(); }
    else toast.success(`${key.replace(/_/g, ' ')} ${value ? 'enabled' : 'switched off'}`);
  };

  const userFlag = (uid: string, key: string) => {
    const row = users.find((x) => x.user_id === uid);
    return row ? row[key] !== false : true;
  };

  const toggleUser = async (uid: string, key: string, value: boolean) => {
    setUsers((prev) => {
      const found = prev.find((x) => x.user_id === uid);
      if (found) return prev.map((x) => (x.user_id === uid ? { ...x, [key]: value } : x));
      return [...prev, { user_id: uid, new_signals_enabled: true, new_orders_enabled: true, [key]: value }];
    });
    const existing = users.find((x) => x.user_id === uid) || { new_signals_enabled: true, new_orders_enabled: true };
    const { error } = await supabase.from('user_kill_switch').upsert({
      user_id: uid,
      new_signals_enabled: existing.new_signals_enabled !== false,
      new_orders_enabled: existing.new_orders_enabled !== false,
      [key]: value,
      updated_at: new Date().toISOString(),
    });
    if (error) { toast.error(error.message); load(); }
  };

  const visible = profiles.filter((p) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return [p.client_id, p.full_name, p.email].some((v) => String(v || '').toLowerCase().includes(t));
  });

  if (loading || !cfg) {
    return <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="size-5 animate-spin mr-2" /> Loading…</div>;
  }

  const allOn = GLOBAL_SWITCHES.every(([k]) => cfg[k] !== false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Power className="size-6 text-red-400" />
        <h2 className="text-2xl font-bold text-white">Kill Switch</h2>
        <Badge className={allOn ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}>
          {allOn ? 'Everything running' : 'Restrictions active'}
        </Badge>
        <Button variant="outline" size="sm" className="ml-auto gap-2" onClick={load}><RefreshCw className="size-4" /> Refresh</Button>
      </div>

      <Card className="bg-slate-900/60 border-red-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-200">
            <ShieldAlert className="size-4 text-red-400" /> Platform wide
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {GLOBAL_SWITCHES.map(([key, label, help]) => (
            <div key={key} className="flex items-center justify-between gap-4 rounded-lg border border-slate-700/60 p-3">
              <div>
                <p className="text-sm font-medium text-slate-200">{label}</p>
                <p className="text-xs text-slate-400">{help}</p>
              </div>
              <Switch checked={cfg[key] !== false} onCheckedChange={(v) => toggleGlobal(key, v)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-700/60">
        <CardHeader><CardTitle className="text-base text-slate-200">Per user</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Search client id, name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-[55vh] overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Client ID</TableHead><TableHead>Name</TableHead><TableHead>Email</TableHead>
                <TableHead>New signals</TableHead><TableHead>New orders</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {visible.map((p) => (
                  <TableRow key={p.user_id}>
                    <TableCell className="font-mono text-xs">{p.client_id}</TableCell>
                    <TableCell className="text-xs">{p.full_name || '—'}</TableCell>
                    <TableCell className="text-xs">{p.email || '—'}</TableCell>
                    <TableCell>
                      <Switch checked={userFlag(p.user_id, 'new_signals_enabled')}
                        onCheckedChange={(v) => toggleUser(p.user_id, 'new_signals_enabled', v)} />
                    </TableCell>
                    <TableCell>
                      <Switch checked={userFlag(p.user_id, 'new_orders_enabled')}
                        onCheckedChange={(v) => toggleUser(p.user_id, 'new_orders_enabled', v)} />
                    </TableCell>
                  </TableRow>
                ))}
                {!visible.length && <TableRow><TableCell colSpan={5} className="text-center text-slate-500 py-6">No users</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminKillSwitch;
