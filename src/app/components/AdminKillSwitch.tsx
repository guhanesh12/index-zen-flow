// @ts-nocheck
import { useCallback, useEffect, useState } from 'react';
import { adminGet, adminPost } from '@/app/utils/adminOpsApi';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { toast } from 'sonner';
import { Power, Loader2, RefreshCw, ShieldAlert, Save, Target } from 'lucide-react';

const GLOBAL_SWITCHES: Array<[string, string, string]> = [
  ['trading_enabled', 'All user activity', 'Master switch — off blocks signals, orders, broker connect, strategy start and backtests for everyone.'],
  ['new_signals_enabled', 'New signals', 'Engine stops publishing new BUY CALL / BUY PUT signals. Open positions keep running.'],
  ['new_orders_enabled', 'New orders', 'No fresh entry orders are sent to any broker. Exits stay allowed.'],
  ['broker_connect_enabled', 'Broker connection', 'Users cannot connect or reconnect a broker account.'],
  ['strategy_creation_enabled', 'Strategy creation / engine start', 'Users cannot create a strategy or start the engine.'],
  ['backtest_enabled', 'Backtest', 'Backtesting is switched off for all users.'],
];

const INDICES: Array<[string, string, string]> = [
  ['NIFTY', 'nifty_target_per_lot', 'nifty_stop_per_lot'],
  ['BANKNIFTY', 'banknifty_target_per_lot', 'banknifty_stop_per_lot'],
  ['SENSEX', 'sensex_target_per_lot', 'sensex_stop_per_lot'],
];

const RISK_DEFAULTS = {
  sl_tp_mode: 'auto',
  nifty_target_per_lot: 6000, nifty_stop_per_lot: 3000,
  banknifty_target_per_lot: 6000, banknifty_stop_per_lot: 3000,
  sensex_target_per_lot: 6000, sensex_stop_per_lot: 3000,
  trailing_enabled: true,
};

export function AdminKillSwitch({ serverUrl, accessToken }: { serverUrl?: string; accessToken?: string } = {}) {
  const [cfg, setCfg] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRisk, setSavingRisk] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await adminGet('/admin/ops/controls', serverUrl, accessToken);
      setCfg({ id: 1, ...RISK_DEFAULTS, ...(j.killSwitch || {}) });
      setUsers(j.userKillSwitch || []);
      setProfiles(j.profiles || []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load kill switch');
      setCfg({ id: 1, ...RISK_DEFAULTS });
    } finally {
      setLoading(false);
    }
  }, [serverUrl, accessToken]);
  useEffect(() => { load(); }, [load]);

  const saveConfig = async (next: any, successMsg?: string) => {
    try {
      await adminPost('/admin/ops/controls/kill-switch', next, serverUrl, accessToken);
      if (successMsg) toast.success(successMsg);
    } catch (e: any) {
      toast.error(e.message || 'Save failed');
      load();
    }
  };

  const toggleGlobal = async (key: string, value: boolean) => {
    const next = { ...cfg, [key]: value };
    setCfg(next);
    await saveConfig(next, `${key.replace(/_/g, ' ')} ${value ? 'enabled' : 'switched off'}`);
  };

  const setRisk = (k: string, v: any) => setCfg((p: any) => ({ ...p, [k]: v }));

  const saveRisk = async () => {
    setSavingRisk(true);
    await saveConfig(cfg, 'Target / stop loss settings saved');
    setSavingRisk(false);
    load();
  };

  const userFlag = (uid: string, key: string) => {
    const row = users.find((x) => x.user_id === uid);
    return row ? row[key] !== false : true;
  };

  const toggleUser = async (uid: string, key: string, value: boolean) => {
    const existing = users.find((x) => x.user_id === uid) || { new_signals_enabled: true, new_orders_enabled: true };
    setUsers((prev) => {
      const found = prev.find((x) => x.user_id === uid);
      if (found) return prev.map((x) => (x.user_id === uid ? { ...x, [key]: value } : x));
      return [...prev, { user_id: uid, new_signals_enabled: true, new_orders_enabled: true, [key]: value }];
    });
    try {
      await adminPost('/admin/ops/controls/user-kill-switch', {
        user_id: uid,
        new_signals_enabled: existing.new_signals_enabled !== false,
        new_orders_enabled: existing.new_orders_enabled !== false,
        [key]: value,
      }, serverUrl, accessToken);
    } catch (e: any) {
      toast.error(e.message || 'Save failed');
      load();
    }
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
  const manual = cfg.sl_tp_mode === 'manual';

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
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-200">
            <Target className="size-4 text-emerald-400" /> Target &amp; stop loss
            <Badge className={manual ? 'bg-amber-500/20 text-amber-300' : 'bg-sky-500/20 text-sky-300'}>
              {manual ? 'Manual' : 'Auto'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setRisk('sl_tp_mode', 'auto')}
              className={`rounded-lg border p-3 text-left ${!manual ? 'border-sky-500/60 bg-sky-500/10' : 'border-slate-700/60'}`}
            >
              <p className="text-sm font-medium text-slate-200">Auto</p>
              <p className="text-xs text-slate-400">The engine sizes target and stop loss from live volatility for every trade.</p>
            </button>
            <button
              type="button"
              onClick={() => setRisk('sl_tp_mode', 'manual')}
              className={`rounded-lg border p-3 text-left ${manual ? 'border-amber-500/60 bg-amber-500/10' : 'border-slate-700/60'}`}
            >
              <p className="text-sm font-medium text-slate-200">Manual</p>
              <p className="text-xs text-slate-400">Use the fixed rupee target and stop loss per lot set below for every user.</p>
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {INDICES.map(([label, tgtKey, slKey]) => (
              <div key={label} className="space-y-2 rounded-lg border border-slate-700/60 p-3">
                <p className="text-sm font-medium text-slate-200">{label}</p>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-400">Target per lot (₹)</Label>
                  <Input type="number" min={100} disabled={!manual} value={cfg[tgtKey] ?? 6000}
                    onChange={(e) => setRisk(tgtKey, e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-400">Stop loss per lot (₹)</Label>
                  <Input type="number" min={100} disabled={!manual} value={cfg[slKey] ?? 3000}
                    onChange={(e) => setRisk(slKey, e.target.value)} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-700/60 p-3">
            <div>
              <p className="text-sm text-slate-200">Trailing stop loss</p>
              <p className="text-xs text-slate-400">Locks profit as the trade moves in favour. The position monitor runs it live.</p>
            </div>
            <Switch checked={cfg.trailing_enabled !== false} onCheckedChange={(v) => setRisk('trailing_enabled', v)} />
          </div>

          <div className="flex justify-end">
            <Button size="sm" className="gap-2" onClick={saveRisk} disabled={savingRisk}>
              {savingRisk ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save risk settings
            </Button>
          </div>
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
