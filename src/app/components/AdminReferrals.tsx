// @ts-nocheck
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Gift, Settings as SettingsIcon, Trophy, List, Save, Users, IndianRupee, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '@/utils-ext/supabase/info';
import { getServerUrl } from '@/utils-ext/config/apiConfig';
import { useAllowedTabs } from '@/hooks/useAllowedTabs';

interface Props {
  accessToken: string;
}

const fmt = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const REFERRAL_SUB_TABS = ['settings', 'list', 'leaderboard'];

export function AdminReferrals({ accessToken }: Props) {
  const tabPerms = useAllowedTabs();
  const [activeSubTab, setActiveSubTab] = useState('settings');
  const serverUrl = getServerUrl(projectId);
  const [stats, setStats] = useState<any>({ total: 0, successful: 0, pending: 0, totalPayout: 0 });
  const [settings, setSettings] = useState<any>({
    reward_amount: 100,
    enabled: true,
    share_template_whatsapp: '',
    share_template_telegram: '',
    share_template_email: '',
    share_template_generic: '',
  });
  const [referrals, setReferrals] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'rewarded'>('all');

  const load = async () => {
    try {
      const [o, l, lb] = await Promise.all([
        fetch(`${serverUrl}/admin/referrals/overview`, { headers: { Authorization: `Bearer ${accessToken}` } }).then((r) => r.json()),
        fetch(`${serverUrl}/admin/referrals/list`, { headers: { Authorization: `Bearer ${accessToken}` } }).then((r) => r.json()),
        fetch(`${serverUrl}/admin/referrals/leaderboard`, { headers: { Authorization: `Bearer ${accessToken}` } }).then((r) => r.json()),
      ]);
      if (o.stats) setStats(o.stats);
      if (o.settings) setSettings(o.settings);
      if (l.referrals) setReferrals(l.referrals);
      if (lb.leaderboard) setLeaderboard(lb.leaderboard);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const showSub = (key: string) => tabPerms.loading ? false : tabPerms.allowSub('referrals', key);

  useEffect(() => {
    if (tabPerms.loading) return;
    if (showSub(activeSubTab)) return;
    const firstAllowed = REFERRAL_SUB_TABS.find((key) => tabPerms.allowSub('referrals', key));
    if (firstAllowed) setActiveSubTab(firstAllowed);
  }, [tabPerms.loading, tabPerms.isSuperAdmin, tabPerms.hasAnyConfig, activeSubTab]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${serverUrl}/admin/referrals/settings`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const j = await res.json();
      if (j.success) {
        toast.success('Settings saved');
        setSettings(j.settings);
      } else {
        toast.error(j.error || 'Failed to save');
      }
    } finally {
      setSaving(false);
    }
  };

  const filtered = referrals.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'rewarded') return r.status === 'rewarded';
    return ['pending', 'registered'].includes(r.status);
  });

  if (loading) return <div className="text-center py-12 text-zinc-400">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Gift className="w-6 h-6 text-purple-400" /> Referral Management
          </h2>
          <p className="text-sm text-zinc-400">Configure rewards, monitor referrals and payouts</p>
        </div>
        <Badge className={settings.enabled ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-zinc-700 text-zinc-300'}>
          {settings.enabled ? 'Active' : 'Disabled'}
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Users, label: 'Total Referrals', value: stats.total, color: 'cyan' },
          { icon: CheckCircle2, label: 'Successful', value: stats.successful, color: 'emerald' },
          { icon: Clock, label: 'Pending', value: stats.pending, color: 'amber' },
          { icon: IndianRupee, label: 'Total Payouts', value: fmt(stats.totalPayout), color: 'purple' },
        ].map((s, i) => {
          const colorMap: any = {
            cyan: 'border-cyan-500/30 from-cyan-500/20 to-blue-500/10 text-cyan-300',
            emerald: 'border-emerald-500/30 from-emerald-500/20 to-green-500/10 text-emerald-300',
            amber: 'border-amber-500/30 from-amber-500/20 to-orange-500/10 text-amber-300',
            purple: 'border-purple-500/30 from-purple-500/20 to-fuchsia-500/10 text-purple-300',
          };
          return (
            <div key={i} className={`bg-gradient-to-br ${colorMap[s.color]} border rounded-xl p-4`}>
              <div className="flex items-center justify-between mb-2">
                <s.icon className="w-4 h-4 opacity-80" />
                <span className="text-[10px] uppercase tracking-wider opacity-70">{s.label}</span>
              </div>
              <div className="text-xl font-bold text-white">{s.value}</div>
            </div>
          );
        })}
      </div>

      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          {showSub('settings') && <TabsTrigger value="settings" className="gap-2"><SettingsIcon className="w-4 h-4" /> Settings</TabsTrigger>}
          {showSub('list') && <TabsTrigger value="list" className="gap-2"><List className="w-4 h-4" /> Referrals</TabsTrigger>}
          {showSub('leaderboard') && <TabsTrigger value="leaderboard" className="gap-2"><Trophy className="w-4 h-4" /> Leaderboard</TabsTrigger>}
        </TabsList>

        {showSub('settings') && <TabsContent value="settings" className="mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Reward Configuration</CardTitle>
              <CardDescription>Sets the reward amount credited to the referrer when a referee places their first trade.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-zinc-300">Reward Amount (₹)</Label>
                  <Input
                    type="number"
                    value={settings.reward_amount}
                    onChange={(e) => setSettings({ ...settings, reward_amount: Number(e.target.value) })}
                    className="bg-zinc-950 border-zinc-700 text-white mt-1"
                  />
                </div>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Label className="text-zinc-300">Referral System</Label>
                    <div className="flex items-center gap-3 mt-2 p-2 bg-zinc-950 border border-zinc-700 rounded-md">
                      <Switch
                        checked={settings.enabled}
                        onCheckedChange={(v) => setSettings({ ...settings, enabled: v })}
                      />
                      <span className="text-sm text-white">{settings.enabled ? 'Enabled' : 'Disabled'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-zinc-300">Share Message Templates</h4>
                <p className="text-xs text-zinc-500">Use placeholders: <code className="text-cyan-300">{'{REFERRAL_LINK}'}</code>, <code className="text-cyan-300">{'{REFERRAL_CODE}'}</code>, <code className="text-cyan-300">{'{REWARD_AMOUNT}'}</code></p>
                {[
                  { key: 'share_template_whatsapp', label: 'WhatsApp' },
                  { key: 'share_template_telegram', label: 'Telegram' },
                  { key: 'share_template_email', label: 'Email' },
                  { key: 'share_template_generic', label: 'Generic' },
                ].map((t) => (
                  <div key={t.key}>
                    <Label className="text-zinc-300 text-xs">{t.label}</Label>
                    <Textarea
                      rows={4}
                      value={settings[t.key] || ''}
                      onChange={(e) => setSettings({ ...settings, [t.key]: e.target.value })}
                      className="bg-zinc-950 border-zinc-700 text-white mt-1 font-mono text-xs"
                    />
                  </div>
                ))}
              </div>

              <Button onClick={save} disabled={saving} className="bg-cyan-600 hover:bg-cyan-700 gap-2">
                <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>}

        {showSub('list') && <TabsContent value="list" className="mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white">Referral Transactions</CardTitle>
                <div className="flex gap-1">
                  {(['all', 'pending', 'rewarded'] as const).map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant={filter === f ? 'default' : 'outline'}
                      onClick={() => setFilter(f)}
                      className={filter === f ? 'bg-cyan-600' : 'border-zinc-700 text-zinc-300'}
                    >
                      {f}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-zinc-500 uppercase border-b border-zinc-800">
                      <th className="py-2 px-2">Referee</th>
                      <th className="py-2 px-2">Referrer</th>
                      <th className="py-2 px-2">Status</th>
                      <th className="py-2 px-2">Reward</th>
                      <th className="py-2 px-2">Registered</th>
                      <th className="py-2 px-2">First Trade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={6} className="py-8 text-center text-zinc-500">No referrals.</td></tr>
                    ) : filtered.map((r) => (
                      <tr key={r.id} className="border-b border-zinc-800/50 text-zinc-300">
                        <td className="py-2 px-2 font-mono">{r.referee_client_id || '—'}</td>
                        <td className="py-2 px-2 font-mono">{r.referrer_client_id || '—'}</td>
                        <td className="py-2 px-2">
                          <Badge className={
                            r.status === 'rewarded' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                            'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          }>{r.status}</Badge>
                        </td>
                        <td className="py-2 px-2 text-emerald-400 font-semibold">
                          {Number(r.reward_amount) > 0 ? fmt(r.reward_amount) : '—'}
                        </td>
                        <td className="py-2 px-2 text-xs">{new Date(r.registered_at).toLocaleDateString()}</td>
                        <td className="py-2 px-2 text-xs">{r.first_trade_at ? new Date(r.first_trade_at).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>}

        {showSub('leaderboard') && <TabsContent value="leaderboard" className="mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" /> Top Referrers
              </CardTitle>
            </CardHeader>
            <CardContent>
              {leaderboard.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">No referrers yet.</div>
              ) : (
                <div className="space-y-2">
                  {leaderboard.map((u, i) => (
                    <div key={u.user_id} className="flex items-center justify-between p-3 bg-zinc-950/60 border border-zinc-800 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                          i === 0 ? 'bg-amber-500 text-black' :
                          i === 1 ? 'bg-zinc-300 text-black' :
                          i === 2 ? 'bg-orange-700 text-white' :
                          'bg-zinc-800 text-zinc-400'
                        }`}>{i + 1}</div>
                        <div>
                          <div className="text-white font-medium">{u.full_name || u.client_id}</div>
                          <div className="text-xs text-zinc-500 font-mono">{u.client_id}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-emerald-400 font-bold">{fmt(u.total_earned)}</div>
                        <div className="text-xs text-zinc-500">{u.successful_count} successful · {u.pending_count} pending</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>}
      </Tabs>
    </div>
  );
}

export default AdminReferrals;
