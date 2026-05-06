// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { toast } from 'sonner';
import { Power, PowerOff, Server, Activity, RefreshCw, Star, Calendar } from 'lucide-react';

interface Props {
  serverUrl: string;
  accessToken: string;
}

interface VpsRow {
  userId: string;
  email?: string;
  ipAddress?: string;
  dropletId?: string;
  powerState: 'on' | 'off' | 'unknown';
  powerSource?: string;
  powerAt?: string;
  powerError?: string;
  engineRunning: boolean;
  engineHeartbeat?: string;
  engineStartedAt?: string;
  engineStoppedAt?: string;
}

interface Snapshot {
  scheduleEnabled: boolean;
  specialSessionDate: string | null;
  istDate: string;
  istDow: number;
  vps: VpsRow[];
}

export function AdminVPSPower({ serverUrl, accessToken }: Props) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);

  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await fetch(`${serverUrl}/admin/vps-power/status`, { headers });
      const d = await r.json();
      if (d.success) setSnap(d);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [serverUrl, accessToken]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (path: string, body: any = {}, label: string) => {
    setActing(true);
    try {
      const r = await fetch(`${serverUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
      const d = await r.json();
      if (d.success) toast.success(label + ' OK');
      else toast.error(d.error || 'Action failed');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActing(false);
    }
  };

  const toggleSchedule = async (enabled: boolean) => {
    await act('/admin/vps-power/schedule', { enabled }, `Schedule ${enabled ? 'enabled' : 'disabled'}`);
  };

  const onUserToggle = async (userId: string, target: 'on' | 'off') => {
    await act(`/admin/vps-power/toggle/${userId}`, { target }, `User VPS ${target.toUpperCase()}`);
  };

  const fmt = (iso?: string) => iso ? new Date(iso).toLocaleString('en-IN', { hour12: false }) : '—';
  const dowName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][snap?.istDow ?? 0];

  return (
    <div className="space-y-4">
      <Card className="bg-slate-800/50 border-blue-500/20">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Server className="size-5 text-blue-400" /> VPS Power Scheduler
          </CardTitle>
          <CardDescription>
            Auto OFF at 15:31 IST · Auto ON at 08:55 IST (Mon–Fri) · Weekends stay OFF
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-slate-700 bg-slate-900/50 p-3">
            <div>
              <div className="text-white font-medium">Auto-schedule</div>
              <div className="text-xs text-slate-400">When OFF, no automatic shutdown/startup happens.</div>
            </div>
            <Switch checked={!!snap?.scheduleEnabled} onCheckedChange={toggleSchedule} disabled={acting} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => act('/admin/vps-power/all-on', {}, 'Power ON all')} disabled={acting}
              className="bg-emerald-600 hover:bg-emerald-500">
              <Power className="size-4 mr-1" /> Power ON all VPS
            </Button>
            <Button onClick={() => act('/admin/vps-power/all-off', {}, 'Power OFF all')} disabled={acting}
              variant="destructive">
              <PowerOff className="size-4 mr-1" /> Power OFF all VPS
            </Button>
            <Button onClick={() => act('/admin/vps-power/all-on', { markSpecial: true }, 'Special session ON')} disabled={acting}
              className="bg-amber-600 hover:bg-amber-500">
              <Star className="size-4 mr-1" /> Special trading session (keep ON today)
            </Button>
            {snap?.specialSessionDate && (
              <Button onClick={() => act('/admin/vps-power/clear-special', {}, 'Cleared')} disabled={acting} variant="outline">
                Clear special: {snap.specialSessionDate}
              </Button>
            )}
            <Button onClick={load} variant="outline" disabled={loading}>
              <RefreshCw className={`size-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-2">
            <Calendar className="size-3" /> Today IST: {snap?.istDate} ({dowName})
            {(snap?.istDow === 0 || snap?.istDow === 6) && <Badge variant="outline" className="text-amber-400 border-amber-500">Weekend</Badge>}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-blue-500/20">
        <CardHeader>
          <CardTitle className="text-white">Live VPS & Engine Status</CardTitle>
          <CardDescription>Engine status is read-only. Admin cannot start/stop user trading engines.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-700">
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Static IP</th>
                  <th className="py-2 pr-3">Droplet</th>
                  <th className="py-2 pr-3">VPS Power</th>
                  <th className="py-2 pr-3">Engine</th>
                  <th className="py-2 pr-3">Last Action</th>
                  <th className="py-2 pr-3">Override</th>
                </tr>
              </thead>
              <tbody>
                {(snap?.vps || []).map(r => (
                  <tr key={r.userId} className="border-b border-slate-800/60 text-slate-200">
                    <td className="py-2 pr-3">{r.email || r.userId.slice(0, 8)}</td>
                    <td className="py-2 pr-3 font-mono text-emerald-400">{r.ipAddress || '—'}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.dropletId || '—'}</td>
                    <td className="py-2 pr-3">
                      {r.powerState === 'on' && <Badge className="bg-emerald-600">ON</Badge>}
                      {r.powerState === 'off' && <Badge variant="secondary">OFF</Badge>}
                      {r.powerState === 'unknown' && <Badge variant="outline" className="text-amber-400 border-amber-500">?</Badge>}
                      {r.powerError && <div className="text-xs text-red-400 mt-1">{r.powerError}</div>}
                    </td>
                    <td className="py-2 pr-3">
                      {r.engineRunning
                        ? <Badge className="bg-blue-600"><Activity className="size-3 mr-1" />Running</Badge>
                        : <Badge variant="secondary">Stopped</Badge>}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-400">
                      {r.powerSource ? `${r.powerSource} · ${fmt(r.powerAt)}` : '—'}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" disabled={acting}
                          onClick={() => onUserToggle(r.userId, 'on')}>
                          <Power className="size-3" />
                        </Button>
                        <Button size="sm" variant="outline" disabled={acting}
                          onClick={() => onUserToggle(r.userId, 'off')}>
                          <PowerOff className="size-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!snap?.vps || snap.vps.length === 0) && (
                  <tr><td colSpan={7} className="py-6 text-center text-slate-500">No assigned VPS yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminVPSPower;
