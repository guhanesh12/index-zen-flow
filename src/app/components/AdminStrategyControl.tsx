// @ts-nocheck
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { Cog, Loader2, RefreshCw, Save } from 'lucide-react';

const DEFAULTS = {
  id: 1,
  strategy_id: 'STG-IPAI-V3',
  enabled: true,
  nifty_enabled: true,
  banknifty_enabled: true,
  sensex_enabled: true,
  min_confidence: 75,
  max_trades_per_index_per_day: 1,
  entry_start_ist: '09:30',
  entry_end_ist: '15:00',
  note: '',
};

export function AdminStrategyControl() {
  const [cfg, setCfg] = useState<any>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('strategy_control').select('*').eq('id', 1).maybeSingle();
    if (data) setCfg({ ...DEFAULTS, ...data });
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k: string, v: any) => setCfg((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('strategy_control').upsert({
      id: 1,
      strategy_id: cfg.strategy_id,
      enabled: cfg.enabled,
      nifty_enabled: cfg.nifty_enabled,
      banknifty_enabled: cfg.banknifty_enabled,
      sensex_enabled: cfg.sensex_enabled,
      min_confidence: Number(cfg.min_confidence),
      max_trades_per_index_per_day: Number(cfg.max_trades_per_index_per_day),
      entry_start_ist: cfg.entry_start_ist,
      entry_end_ist: cfg.entry_end_ist,
      note: cfg.note || null,
      updated_by: auth?.user?.id || null,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success('Strategy control saved'); load(); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="size-5 animate-spin mr-2" /> Loading…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Cog className="size-6 text-blue-400" />
        <h2 className="text-2xl font-bold text-white">Strategy Control</h2>
        <Badge className={cfg.enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}>
          {cfg.enabled ? 'Live' : 'Paused'}
        </Badge>
        <Badge className="bg-slate-600/30 text-slate-300 font-mono">{cfg.strategy_id}</Badge>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={load}><RefreshCw className="size-4" /> Reload</Button>
          <Button size="sm" className="gap-2" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
          </Button>
        </div>
      </div>

      <Card className="bg-slate-900/60 border-slate-700/60">
        <CardHeader><CardTitle className="text-base text-slate-200">Strategy</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-slate-700/60 p-3">
            <div>
              <p className="text-sm font-medium text-slate-200">Strategy enabled</p>
              <p className="text-xs text-slate-400">When off, the engine publishes WAIT for every index.</p>
            </div>
            <Switch checked={!!cfg.enabled} onCheckedChange={(v) => set('enabled', v)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[['nifty_enabled', 'NIFTY'], ['banknifty_enabled', 'BANKNIFTY'], ['sensex_enabled', 'SENSEX']].map(([k, label]) => (
              <div key={k} className="flex items-center justify-between rounded-lg border border-slate-700/60 p-3">
                <span className="text-sm text-slate-200">{label}</span>
                <Switch checked={!!cfg[k]} onCheckedChange={(v) => set(k, v)} />
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Strategy ID</Label>
              <Input value={cfg.strategy_id} onChange={(e) => set('strategy_id', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Minimum confidence (%)</Label>
              <Input type="number" min={50} max={99} value={cfg.min_confidence} onChange={(e) => set('min_confidence', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Max trades / index / day</Label>
              <Input type="number" min={1} max={10} value={cfg.max_trades_per_index_per_day} onChange={(e) => set('max_trades_per_index_per_day', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">Entry start (IST)</Label>
                <Input value={cfg.entry_start_ist} onChange={(e) => set('entry_start_ist', e.target.value)} placeholder="09:30" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">Entry end (IST)</Label>
                <Input value={cfg.entry_end_ist} onChange={(e) => set('entry_end_ist', e.target.value)} placeholder="15:00" />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-slate-400">Note</Label>
            <Input value={cfg.note || ''} onChange={(e) => set('note', e.target.value)} placeholder="Reason for this change" />
          </div>

          <p className="text-xs text-slate-500">
            Every signal and order is stamped with this strategy ID plus the user's algo ID, so order logs stay traceable.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminStrategyControl;
