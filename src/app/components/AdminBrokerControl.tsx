// @ts-nocheck
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Button } from './ui/button';
import { Building2, RefreshCw, CheckCircle2, Clock, ExternalLink, ShieldCheck } from 'lucide-react';
import { BrokerLogo, ALL_8_BROKERS, getBrokerMeta } from '../brokerLogos';


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
  apiType?: string;
  description?: string;
}

export function AdminBrokerControl({ serverUrl, accessToken }: AdminBrokerControlProps) {
  const [brokers, setBrokers] = useState<BrokerRow[]>(ALL_8_BROKERS as any[]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${serverUrl}/admin/brokers`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (data?.success && Array.isArray(data.brokers) && data.brokers.length > 0) {
        // Merge with ALL_8_BROKERS catalog to guarantee all 8 brokers have full metadata and logos
        const merged = ALL_8_BROKERS.map((def) => {
          const fromServer = data.brokers.find((b: any) => b.id === def.id);
          return fromServer ? { ...def, ...fromServer } : def;
        });
        setBrokers(merged);
      }
    } catch (e: any) {
      console.warn('Could not fetch server broker list, using local 8-broker registry:', e?.message || e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [serverUrl, accessToken]);

  const toggle = async (broker: BrokerRow, enabled: boolean) => {
    try {
      setSaving(broker.id);
      // Optimistically update
      setBrokers((prev) =>
        prev.map((b) => (b.id === broker.id ? { ...b, enabled } : b))
      );
      const res = await fetch(`${serverUrl}/admin/brokers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ broker: broker.id, enabled }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || 'Update failed');
      if (Array.isArray(data.brokers)) {
        setBrokers((prev) =>
          prev.map((b) => {
            const found = data.brokers.find((sb: any) => sb.id === b.id);
            return found ? { ...b, ...found } : b;
          })
        );
      }
      toast.success(`${broker.name} ${enabled ? 'enabled' : 'disabled'} for all users`);
    } catch (e: any) {
      toast.error(e?.message || 'Update failed');
      // Revert on error
      load();
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
              8 Supported Brokers
            </Badge>
            <Badge variant="outline" className="text-cyan-400 border-cyan-500/30">
              Dedicated Static IP Ready
            </Badge>
          </div>
          <CardTitle className="flex items-center gap-2 text-white text-xl">
            <Building2 className="size-5 text-cyan-400" />
            Broker Control Center
          </CardTitle>
          <CardDescription className="text-slate-400 text-sm mt-1">
            Manage integration status and user availability for all 8 Indian brokers. Enabled brokers
            are accessible in user settings, the live trading engine, and the public landing page.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="border-slate-700 shrink-0">
          <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh Status
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {brokers.map((b, i) => {
            const meta = getBrokerMeta(b.id);
            return (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`flex flex-col justify-between rounded-xl border p-4 transition-all duration-200 ${
                  b.enabled
                    ? 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                    : 'border-slate-900/80 bg-slate-950/40 opacity-70'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <BrokerLogo id={b.id} name={b.name} color={b.color} size={44} className="shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-white text-base truncate">{b.name}</span>
                        {b.status === 'live' ? (
                          <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] py-0 px-1.5">
                            <CheckCircle2 className="size-2.5 mr-0.5 inline" /> Live
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-700/50 text-slate-400 border-slate-600/30 text-[10px] py-0 px-1.5">
                            <Clock className="size-2.5 mr-0.5 inline" /> Coming soon
                          </Badge>
                        )}
                        {meta?.apiType && (
                          <Badge variant="outline" className="text-slate-400 border-slate-700 text-[10px] py-0 px-1.5">
                            {meta.apiType}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                        {meta?.description || b.website}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={b.enabled}
                    disabled={saving === b.id}
                    onCheckedChange={(v) => toggle(b, v)}
                    className="shrink-0"
                    aria-label={`Enable ${b.name}`}
                  />
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap text-slate-400">
                    <span className="text-slate-300 font-medium">Features:</span>
                    {(b.features || meta?.features || []).slice(0, 3).map((feat: string) => (
                      <span key={feat} className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-[11px] text-slate-300">
                        {feat.replace(/-/g, ' ')}
                      </span>
                    ))}
                  </div>
                  {b.website && (
                    <a
                      href={b.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors shrink-0 ml-auto"
                    >
                      API Portal <ExternalLink className="size-2.5 ml-1" />
                    </a>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default AdminBrokerControl;
