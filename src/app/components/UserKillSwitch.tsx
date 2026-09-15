// @ts-nocheck
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { Power } from 'lucide-react';

/**
 * User-side kill switch — lets a trader pause new signals and new entry orders
 * for their own account. Open positions and exits are never blocked.
 */
export function UserKillSwitch({ className = '' }: { className?: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [signalsOn, setSignalsOn] = useState(true);
  const [ordersOn, setOrdersOn] = useState(true);
  const [globalOff, setGlobalOff] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id || null;
    setUserId(uid);
    const [mine, global] = await Promise.all([
      uid ? supabase.from('user_kill_switch').select('*').eq('user_id', uid).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('kill_switch_config').select('*').eq('id', 1).maybeSingle(),
    ]);
    if (mine.data) {
      setSignalsOn(mine.data.new_signals_enabled !== false);
      setOrdersOn(mine.data.new_orders_enabled !== false);
    }
    const g = global.data || {};
    const off: string[] = [];
    if (g.trading_enabled === false) off.push('all activity');
    if (g.new_signals_enabled === false) off.push('new signals');
    if (g.new_orders_enabled === false) off.push('new orders');
    setGlobalOff(off);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (key: string, value: boolean) => {
    if (!userId) return;
    if (key === 'new_signals_enabled') setSignalsOn(value); else setOrdersOn(value);
    const { error } = await supabase.from('user_kill_switch').upsert({
      user_id: userId,
      new_signals_enabled: key === 'new_signals_enabled' ? value : signalsOn,
      new_orders_enabled: key === 'new_orders_enabled' ? value : ordersOn,
      updated_at: new Date().toISOString(),
    });
    if (error) { toast.error(error.message); load(); }
    else toast.success(value ? 'Turned on' : 'Turned off');
  };

  if (loading) return null;

  return (
    <Card className={`bg-slate-900/60 border-slate-700/60 ${className}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-slate-200">
          <Power className="size-4 text-red-400" /> My kill switch
          {globalOff.length > 0 && (
            <Badge className="bg-red-500/20 text-red-300 text-[10px]">Admin paused: {globalOff.join(', ')}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between rounded-lg border border-slate-700/60 p-3">
          <div>
            <p className="text-sm text-slate-200">New signals</p>
            <p className="text-xs text-slate-400">Off = no new signals for your account.</p>
          </div>
          <Switch checked={signalsOn} onCheckedChange={(v) => save('new_signals_enabled', v)} />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-700/60 p-3">
          <div>
            <p className="text-sm text-slate-200">New orders</p>
            <p className="text-xs text-slate-400">Off = no new entry orders. Exits still work.</p>
          </div>
          <Switch checked={ordersOn} onCheckedChange={(v) => save('new_orders_enabled', v)} />
        </div>
      </CardContent>
    </Card>
  );
}

export default UserKillSwitch;
