// @ts-nocheck
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { Mail, MessageSquare, Phone, Send, RefreshCw, CheckCircle2, XCircle, Clock, AlertCircle, Megaphone, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import AdminBroadcastMail from './AdminBroadcastMail';

const TEMPLATE_LABELS: Record<string, string> = {
  welcome: 'Welcome Email',
  otp: 'OTP Verification',
  password_reset: 'Password Reset',
  password_changed: 'Password Changed',
  wallet_recharge: 'Wallet Recharge',
  subscription: 'Subscription / Premium',
  buy_call: 'Buy Call Signal',
  buy_put: 'Buy Put Signal',
  trade_exit: 'Trade Exit',
  ticket_created: 'Support Ticket Created',
  ticket_reply: 'Support Ticket Reply',
  referral_reward: 'Referral Reward',
  test: 'Test Email',
};

export function AdminCommunication() {
  const [tab, setTab] = useState<'settings' | 'broadcast'>('settings');
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, sent: 0, failed: 0, pending: 0 });
  const [testEmail, setTestEmail] = useState('');
  const [testTemplate, setTestTemplate] = useState('test');
  const [sending, setSending] = useState(false);
  const [brevoOk, setBrevoOk] = useState<boolean | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: s }, { data: l }] = await Promise.all([
        supabase.from('communication_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('email_logs').select('*').order('created_at', { ascending: false }).limit(100),
      ]);
      setSettings(s || { email_enabled: true, sms_enabled: false, whatsapp_enabled: false, from_email: 'noreply@indexpilotai.com', from_name: 'IndexPilot AI', reply_to: '' });
      setLogs(l || []);
      const total = (l || []).length;
      const sent = (l || []).filter((x: any) => x.status === 'sent').length;
      const failed = (l || []).filter((x: any) => x.status === 'failed').length;
      const pending = (l || []).filter((x: any) => x.status === 'pending').length;
      setStats({ total, sent, failed, pending });

      const { data: st } = await supabase.functions.invoke('send-email', { method: 'GET' as any }).catch(() => ({ data: null }));
      // GET needs raw fetch
      try {
        const url = `https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/send-email/status`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}` } });
        const j = await r.json();
        setBrevoOk(!!j.brevo_configured);
      } catch { setBrevoOk(null); }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('communication_settings').upsert({
        id: 1,
        email_enabled: !!settings.email_enabled,
        sms_enabled: !!settings.sms_enabled,
        whatsapp_enabled: !!settings.whatsapp_enabled,
        from_email: settings.from_email || 'noreply@indexpilotai.com',
        from_name: settings.from_name || 'IndexPilot AI',
        reply_to: settings.reply_to || null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success('Communication settings saved');
    } catch (e: any) {
      toast.error(e.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const sendTest = async (channel: 'email' | 'sms' | 'whatsapp') => {
    if (!testEmail) { toast.error('Enter a recipient email'); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          template: channel === 'email' ? testTemplate : 'test',
          to: testEmail,
          name: 'Test User',
          channel,
          data: { name: 'Test User', code: '123456', expiryMinutes: 10, amount: 1000, balance: 5000, txnId: 'TEST-' + Date.now(), plan: 'Premium', expiry: '2026-12-31', symbol: 'NIFTY 25500 CE', entry: 145, target: 175, sl: 130, confidence: 87, ticketId: 'T1001', subject: 'Test ticket', message: 'This is a test reply', clientId: 'ALG0001', referralCode: 'ALG0001', email: testEmail },
        },
      });
      if (error) throw error;
      if (data?.skipped) toast.warning(`${channel.toUpperCase()} is disabled — enable it first`);
      else toast.success(`✅ Test ${channel} sent to ${testEmail}`);
      load();
    } catch (e: any) {
      toast.error(`Failed: ${e.message || e}`);
    } finally { setSending(false); }
  };

  if (loading) return <div className="p-8 text-center text-zinc-400">Loading communication settings…</div>;

  return (
    <div className="space-y-6">
      {/* Service Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { key: 'email_enabled', label: 'Email', icon: Mail, color: 'cyan', live: brevoOk },
          { key: 'sms_enabled', label: 'SMS', icon: Phone, color: 'green', live: settings?.sms_enabled },
          { key: 'whatsapp_enabled', label: 'WhatsApp', icon: MessageSquare, color: 'emerald', live: settings?.whatsapp_enabled },
        ].map(s => {
          const Icon = s.icon;
          const on = settings?.[s.key];
          return (
            <Card key={s.key} className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl bg-${s.color}-500/10 border border-${s.color}-500/30`}><Icon className={`h-5 w-5 text-${s.color}-400`} /></div>
                  <div>
                    <div className="text-white font-semibold">{s.label}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`h-2 w-2 rounded-full ${on ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`} />
                      <span className="text-xs text-zinc-400">{on ? 'Active' : 'Disabled'}</span>
                    </div>
                  </div>
                </div>
                <Switch checked={!!on} onCheckedChange={(v) => setSettings({ ...settings, [s.key]: v })} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-4"><div className="text-xs text-zinc-400 uppercase tracking-wider">Total Sent</div><div className="text-2xl font-bold text-white mt-1">{stats.total}</div></CardContent></Card>
        <Card className="bg-zinc-900 border-green-900/40"><CardContent className="p-4"><div className="text-xs text-green-400 uppercase tracking-wider flex items-center gap-1"><CheckCircle2 className="h-3 w-3"/> Delivered</div><div className="text-2xl font-bold text-green-400 mt-1">{stats.sent}</div></CardContent></Card>
        <Card className="bg-zinc-900 border-red-900/40"><CardContent className="p-4"><div className="text-xs text-red-400 uppercase tracking-wider flex items-center gap-1"><XCircle className="h-3 w-3"/> Failed</div><div className="text-2xl font-bold text-red-400 mt-1">{stats.failed}</div></CardContent></Card>
        <Card className="bg-zinc-900 border-amber-900/40"><CardContent className="p-4"><div className="text-xs text-amber-400 uppercase tracking-wider flex items-center gap-1"><Clock className="h-3 w-3"/> Pending</div><div className="text-2xl font-bold text-amber-400 mt-1">{stats.pending}</div></CardContent></Card>
      </div>

      {/* SMTP / Brevo Config */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle className="text-white flex items-center gap-2"><Mail className="h-5 w-5 text-cyan-400"/> Brevo Email Configuration {brevoOk === true && <Badge className="bg-green-600">API Connected</Badge>}{brevoOk === false && <Badge className="bg-red-600">API Key Missing</Badge>}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label className="text-zinc-400">From Email</Label><Input value={settings?.from_email || ''} onChange={(e) => setSettings({ ...settings, from_email: e.target.value })} className="bg-zinc-950 border-zinc-700 text-white mt-1" placeholder="noreply@indexpilotai.com"/></div>
            <div><Label className="text-zinc-400">From Name</Label><Input value={settings?.from_name || ''} onChange={(e) => setSettings({ ...settings, from_name: e.target.value })} className="bg-zinc-950 border-zinc-700 text-white mt-1" placeholder="IndexPilot AI"/></div>
            <div className="md:col-span-2"><Label className="text-zinc-400">Reply-To (optional)</Label><Input value={settings?.reply_to || ''} onChange={(e) => setSettings({ ...settings, reply_to: e.target.value })} className="bg-zinc-950 border-zinc-700 text-white mt-1" placeholder="support@indexpilotai.com"/></div>
          </div>
          <div className="flex gap-2">
            <Button onClick={saveSettings} disabled={saving} className="bg-cyan-600 hover:bg-cyan-700">{saving ? 'Saving…' : 'Save Settings'}</Button>
            <Button onClick={load} variant="outline" className="border-zinc-700 text-zinc-300"><RefreshCw className="h-4 w-4 mr-2"/>Refresh</Button>
          </div>
          {brevoOk === false && <div className="flex items-start gap-2 p-3 bg-amber-950/30 border border-amber-900/40 rounded-lg text-amber-300 text-sm"><AlertCircle className="h-4 w-4 mt-0.5"/> BREVO_API_KEY is not configured in Edge Function secrets. Add it to enable sending.</div>}
        </CardContent>
      </Card>

      {/* Test sending */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle className="text-white flex items-center gap-2"><Send className="h-5 w-5 text-purple-400"/> Send Test Notification</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label className="text-zinc-400">Recipient (email/phone)</Label><Input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className="bg-zinc-950 border-zinc-700 text-white mt-1" placeholder="you@example.com"/></div>
            <div>
              <Label className="text-zinc-400">Template</Label>
              <select value={testTemplate} onChange={(e) => setTestTemplate(e.target.value)} className="w-full mt-1 bg-zinc-950 border border-zinc-700 text-white rounded-md px-3 py-2">
                {Object.entries(TEMPLATE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => sendTest('email')} disabled={sending} className="bg-cyan-600 hover:bg-cyan-700"><Mail className="h-4 w-4 mr-2"/>Test Email</Button>
            <Button onClick={() => sendTest('sms')} disabled={sending} className="bg-green-600 hover:bg-green-700"><Phone className="h-4 w-4 mr-2"/>Test SMS</Button>
            <Button onClick={() => sendTest('whatsapp')} disabled={sending} className="bg-emerald-600 hover:bg-emerald-700"><MessageSquare className="h-4 w-4 mr-2"/>Test WhatsApp</Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle className="text-white">Delivery Logs (latest 100)</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-zinc-400 border-b border-zinc-800"><th className="text-left py-2 px-2">Time</th><th className="text-left py-2 px-2">Channel</th><th className="text-left py-2 px-2">Template</th><th className="text-left py-2 px-2">Recipient</th><th className="text-left py-2 px-2">Status</th><th className="text-left py-2 px-2">Error</th></tr></thead>
              <tbody>
                {logs.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-zinc-500">No logs yet — send a test to see entries here.</td></tr>}
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-zinc-900 text-zinc-300 hover:bg-zinc-900/50">
                    <td className="py-2 px-2 text-xs">{new Date(l.created_at).toLocaleString('en-IN')}</td>
                    <td className="py-2 px-2"><Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">{l.channel}</Badge></td>
                    <td className="py-2 px-2 text-xs">{TEMPLATE_LABELS[l.template] || l.template}</td>
                    <td className="py-2 px-2 text-xs">{l.recipient}</td>
                    <td className="py-2 px-2">
                      {l.status === 'sent' && <Badge className="bg-green-600 text-xs">Sent</Badge>}
                      {l.status === 'failed' && <Badge className="bg-red-600 text-xs">Failed</Badge>}
                      {l.status === 'pending' && <Badge className="bg-amber-600 text-xs">Pending</Badge>}
                      {l.status === 'skipped' && <Badge className="bg-zinc-600 text-xs">Skipped</Badge>}
                    </td>
                    <td className="py-2 px-2 text-xs text-red-400 max-w-xs truncate">{l.error || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminCommunication;
