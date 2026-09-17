// @ts-nocheck
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Button } from './ui/button';
import { Building2, RefreshCw, CheckCircle2, Clock } from 'lucide-react';

interface AdminBrokerControlProps {
  serverUrl: string;
  accessToken: string;
}

interface BrokerRow {
  id: string;
  name: string;
  short: string;
  status: 'live' | 'planned';
  color: string;
  website: string;
  features: string[];
  enabled: boolean;
}

export function AdminBrokerControl({ serverUrl, accessToken }: AdminBrokerControlProps) {
  const [brokers, setBrokers] = useState<BrokerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${serverUrl}/admin/brokers`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (data?.success) setBrokers(data.brokers || []);
      else toast.error(data?.error || 'Failed to load brokers');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load brokers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [serverUrl, accessToken]);

  const toggle = async (broker: BrokerRow, enabled: boolean) => {
    try {
      setSaving(broker.id);
      const res = await fetch(`${serverUrl}/admin/brokers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ broker: broker.id, enabled }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || 'Update failed');
      setBrokers(data.brokers || []);
      toast.success(`${broker.name} ${enabled ? 'enabled' : 'disabled'} for all users`);
    } catch (e: any) {
      toast.error(e?.message || 'Update failed');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-white">
            <Building2 className="size-5 text-cyan-400" />
            Broker Control
          </CardTitle>
          <CardDescription>
            Switch brokers ON/OFF for every user. A disabled broker disappears from the broker
            chooser and the landing page. Users keep one broker at a time — Dhan is the default.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {brokers.map((b, i) => (
          <motion.div
            key={b.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4"
          >
            <div className="flex items-start gap-3 min-w-0">
              <span
                className="mt-1 size-3 rounded-full shrink-0"
                style={{ backgroundColor: b.color }}
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">{b.name}</span>
                  {b.status === 'live' ? (
                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs">
                      <CheckCircle2 className="size-3 mr-1" /> Integrated
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-700/50 text-slate-400 border-slate-600/30 text-xs">
                      <Clock className="size-3 mr-1" /> Coming soon
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1 break-words">
                  {b.features.length ? b.features.join(' · ') : 'Integration not available yet'}
                </p>
              </div>
            </div>
            <Switch
              checked={b.enabled}
              disabled={b.status !== 'live' || saving === b.id}
              onCheckedChange={(v) => toggle(b, v)}
            />
          </motion.div>
        ))}
        {!loading && brokers.length === 0 && (
          <p className="text-sm text-slate-400">No brokers found.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default AdminBrokerControl;
