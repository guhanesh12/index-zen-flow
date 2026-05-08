// @ts-nocheck
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Mail, Phone, MessageSquare, Bell, RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

const TPL_LABELS: Record<string, string> = {
  welcome: 'Welcome', otp: 'OTP', password_reset: 'Password Reset', password_changed: 'Password Changed',
  wallet_recharge: 'Wallet Recharge', subscription: 'Subscription', buy_call: 'Buy Call', buy_put: 'Buy Put',
  trade_exit: 'Trade Exit', ticket_created: 'Ticket Created', ticket_reply: 'Ticket Reply', referral_reward: 'Referral Reward', test: 'Test',
};

export function UserNotificationCenter() {
  const [prefs, setPrefs] = useState<any>({ email_enabled: true, sms_enabled: true, whatsapp_enabled: true, trade_alerts: true, marketing: false });
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return;
      const [{ data: p }, { data: l }] = await Promise.all([
        supabase.from('notification_preferences').select('*').eq('user_id', uid).maybeSingle(),
        supabase.from('email_logs').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(50),
      ]);
      if (p) setPrefs(p);
      setLogs(l || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return;
      const { error } = await supabase.from('notification_preferences').upsert({
        user_id: uid, ...prefs, updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success('Preferences saved');
    } catch (e: any) { toast.error(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-center text-zinc-400">Loading…</div>;

  return (
    <div className="space-y-6">
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle className="text-white flex items-center gap-2"><Bell className="h-5 w-5 text-cyan-400"/> Notification Preferences</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[
            { k: 'email_enabled', icon: Mail, label: 'Email Notifications', desc: 'Account, trades, payments, support' },
            { k: 'sms_enabled', icon: Phone, label: 'SMS Notifications', desc: 'OTP and critical alerts' },
            { k: 'whatsapp_enabled', icon: MessageSquare, label: 'WhatsApp Notifications', desc: 'Real-time signal alerts' },
            { k: 'trade_alerts', icon: Bell, label: 'Trade Signal Alerts', desc: 'Buy Call / Buy Put / Exit' },
            { k: 'marketing', icon: Mail, label: 'Marketing Updates', desc: 'Tips, news, product updates' },
          ].map(({ k, icon: Icon, label, desc }) => (
            <div key={k} className="flex items-center justify-between p-3 bg-zinc-950 rounded-lg border border-zinc-800">
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-zinc-400"/>
                <div><div className="text-white font-medium">{label}</div><div className="text-xs text-zinc-500">{desc}</div></div>
              </div>
              <Switch checked={!!prefs[k]} onCheckedChange={(v) => setPrefs({ ...prefs, [k]: v })} />
            </div>
          ))}
          <Button onClick={save} disabled={saving} className="bg-cyan-600 hover:bg-cyan-700 w-full">{saving ? 'Saving…' : 'Save Preferences'}</Button>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle className="text-white flex items-center justify-between">My Notification History <Button onClick={load} size="sm" variant="outline" className="border-zinc-700"><RefreshCw className="h-3 w-3"/></Button></CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs.length === 0 && <div className="text-center py-8 text-zinc-500 text-sm">No notifications yet</div>}
            {logs.map((l) => (
              <div key={l.id} className="flex items-center gap-3 p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                <div className="flex-shrink-0">
                  {l.status === 'sent' && <CheckCircle2 className="h-5 w-5 text-green-400"/>}
                  {l.status === 'failed' && <XCircle className="h-5 w-5 text-red-400"/>}
                  {l.status === 'pending' && <Clock className="h-5 w-5 text-amber-400"/>}
                  {l.status === 'skipped' && <Clock className="h-5 w-5 text-zinc-500"/>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm font-medium">{TPL_LABELS[l.template] || l.template}</span>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">{l.channel}</Badge>
                  </div>
                  <div className="text-xs text-zinc-500 truncate">{l.subject || l.recipient}</div>
                </div>
                <div className="text-xs text-zinc-500 flex-shrink-0">{new Date(l.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default UserNotificationCenter;
