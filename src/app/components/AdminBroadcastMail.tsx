// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Send, Users, Eye, RefreshCw, Loader2, CheckCircle2, XCircle, Megaphone } from 'lucide-react';
import { toast } from 'sonner';

const SEGMENTS = [
  { key: 'all', label: 'All users', desc: 'Everyone with an email on file' },
  { key: 'email_subscribers', label: 'Active email subscribers', desc: 'Users who opted-in to email alerts' },
  { key: 'vps_renewal_7', label: 'Broker token expiring · 7 days', desc: 'VPS / broker access token due within a week' },
  { key: 'vps_renewal_30', label: 'Broker token expiring · 30 days', desc: 'Renewal due within a month' },
  { key: 'wallet_low', label: 'Wallet balance < ₹50', desc: 'Low balance users — promote recharge' },
  { key: 'referrers', label: 'Active referrers', desc: 'Users with at least 1 referral' },
  { key: 'inactive_30d', label: 'Inactive 30+ days', desc: 'Re-engagement segment' },
  { key: 'custom', label: 'Custom (paste emails)', desc: 'Comma / newline-separated email list' },
];

export function AdminBroadcastMail() {
  const [segment, setSegment] = useState('email_subscribers');
  const [customEmails, setCustomEmails] = useState('');
  const [subject, setSubject] = useState('');
  const [heading, setHeading] = useState('');
  const [body, setBody] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [testTo, setTestTo] = useState('');
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [sample, setSample] = useState<any[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);

  const loadCampaigns = async () => {
    const { data } = await supabase.from('email_campaigns').select('*').order('created_at', { ascending: false }).limit(30);
    setCampaigns(data || []);
  };
  useEffect(() => { loadCampaigns(); }, []);

  const filter = useMemo(() => {
    if (segment !== 'custom') return {};
    const emails = customEmails.split(/[\s,;]+/).map(s => s.trim()).filter(e => /@/.test(e));
    return { emails };
  }, [segment, customEmails]);

  const doPreview = async () => {
    setPreviewing(true); setPreviewCount(null); setSample([]);
    try {
      const { data, error } = await supabase.functions.invoke('admin-broadcast-mail', {
        body: { action: 'preview', segment, filter },
      });
      if (error) throw error;
      setPreviewCount(data.count); setSample(data.sample || []);
      toast.success(`${data.count} recipients matched`);
    } catch (e: any) {
      toast.error(e.message || 'Preview failed');
    } finally { setPreviewing(false); }
  };

  const doSend = async (test: boolean) => {
    if (!subject.trim() || !body.trim()) { toast.error('Subject and body are required'); return; }
    if (test && !testTo.trim()) { toast.error('Enter a test recipient'); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-broadcast-mail', {
        body: {
          action: 'send', segment, filter, subject, heading, body,
          cta_label: ctaLabel || null, cta_url: ctaUrl || null, banner_url: bannerUrl || null,
          test_mode: test, test_to: test ? testTo : undefined,
        },
      });
      if (error) throw error;
      toast.success(`Sent ${data.sent}/${data.total} · ${data.failed} failed`);
      loadCampaigns();
    } catch (e: any) {
      toast.error(e.message || 'Send failed');
    } finally { setSending(false); }
  };

  const previewHtml = useMemo(() => {
    const bodyHtml = body.split(/\n{2,}/).map(p => `<p style="margin:0 0 12px">${p.replace(/\n/g, '<br/>')}</p>`).join('');
    return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1a1a">
      <div style="background:#0B1E3F;color:#fff;padding:16px 22px;border-radius:8px 8px 0 0;font-weight:700">IndexPilot<span style="color:#F4B400">·</span>AI</div>
      <div style="height:3px;background:#F4B400"></div>
      <div style="background:#fff;padding:22px;border:1px solid #e6e8ec;border-top:0;border-radius:0 0 8px 8px">
        ${bannerUrl ? `<img src="${bannerUrl}" style="width:100%;border-radius:6px;margin-bottom:14px"/>` : ''}
        <h2 style="margin:0 0 12px;color:#0B1E3F;font-size:20px">${heading || subject || 'Your heading'}</h2>
        <p>Hi &lt;user name&gt;,</p>
        ${bodyHtml || '<p style="color:#9aa1ad">Body preview…</p>'}
        ${ctaUrl ? `<div style="margin-top:14px"><a href="${ctaUrl}" style="background:#0B1E3F;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">${ctaLabel || 'Learn more'}</a></div>` : ''}
      </div>
    </div>`;
  }, [heading, subject, body, ctaLabel, ctaUrl, bannerUrl]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30"><Megaphone className="h-5 w-5 text-purple-400"/></div>
        <div>
          <h2 className="text-xl font-bold text-white">Broadcast Mail</h2>
          <p className="text-sm text-zinc-400">Compose and send branded emails to any user segment.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Compose */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader><CardTitle className="text-white flex items-center gap-2"><Users className="h-5 w-5 text-cyan-400"/> Audience</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-2">
              {SEGMENTS.map(s => (
                <label key={s.key} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${segment === s.key ? 'border-cyan-500 bg-cyan-500/10' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'}`}>
                  <input type="radio" name="segment" checked={segment === s.key} onChange={() => setSegment(s.key)} className="mt-1"/>
                  <div className="flex-1"><div className="text-white text-sm font-medium">{s.label}</div><div className="text-xs text-zinc-500">{s.desc}</div></div>
                </label>
              ))}
            </div>
            {segment === 'custom' && (
              <div>
                <Label className="text-zinc-400">Email list (comma / newline separated)</Label>
                <Textarea value={customEmails} onChange={e => setCustomEmails(e.target.value)} rows={4} className="bg-zinc-950 border-zinc-700 text-white mt-1 font-mono text-xs"/>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button onClick={doPreview} disabled={previewing} variant="outline" className="border-zinc-700 text-zinc-300">
                {previewing ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <Eye className="h-4 w-4 mr-2"/>} Preview recipients
              </Button>
              {previewCount !== null && <Badge className="bg-cyan-600">{previewCount} matches</Badge>}
            </div>
            {sample.length > 0 && (
              <div className="text-xs text-zinc-500 space-y-1">
                Sample: {sample.map((s: any) => s.email).join(', ')}…
              </div>
            )}
          </CardContent>
        </Card>

        {/* Content */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader><CardTitle className="text-white">Message</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label className="text-zinc-400">Subject *</Label><Input value={subject} onChange={e => setSubject(e.target.value)} className="bg-zinc-950 border-zinc-700 text-white mt-1" placeholder="Your subject line"/></div>
            <div><Label className="text-zinc-400">Heading (shown in email body)</Label><Input value={heading} onChange={e => setHeading(e.target.value)} className="bg-zinc-950 border-zinc-700 text-white mt-1" placeholder="e.g. Renew your broker token"/></div>
            <div><Label className="text-zinc-400">Body * (double newline = paragraph)</Label><Textarea value={body} onChange={e => setBody(e.target.value)} rows={7} className="bg-zinc-950 border-zinc-700 text-white mt-1"/></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-zinc-400">CTA label</Label><Input value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} className="bg-zinc-950 border-zinc-700 text-white mt-1" placeholder="Open dashboard"/></div>
              <div><Label className="text-zinc-400">CTA URL</Label><Input value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} className="bg-zinc-950 border-zinc-700 text-white mt-1" placeholder="https://indexpilotai.com/…"/></div>
            </div>
            <div><Label className="text-zinc-400">Banner image URL (optional)</Label><Input value={bannerUrl} onChange={e => setBannerUrl(e.target.value)} className="bg-zinc-950 border-zinc-700 text-white mt-1"/></div>
          </CardContent>
        </Card>
      </div>

      {/* Preview + Send */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle className="text-white">Live preview</CardTitle></CardHeader>
        <CardContent>
          <div className="bg-zinc-100 p-4 rounded-lg overflow-auto max-h-[420px]" dangerouslySetInnerHTML={{ __html: previewHtml }}/>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="test@example.com" className="max-w-xs bg-zinc-950 border-zinc-700 text-white"/>
            <Button onClick={() => doSend(true)} disabled={sending} variant="outline" className="border-zinc-700 text-zinc-300">{sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <Send className="h-4 w-4 mr-2"/>} Send test</Button>
            <Button onClick={() => doSend(false)} disabled={sending || !previewCount} className="bg-purple-600 hover:bg-purple-700">
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <Send className="h-4 w-4 mr-2"/>}
              Send to {previewCount ?? '—'} users
            </Button>
          </div>
          {!previewCount && <p className="text-xs text-amber-400 mt-2">Run "Preview recipients" first before sending to the segment.</p>}
        </CardContent>
      </Card>

      {/* Campaigns table */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-white">Recent campaigns</CardTitle>
          <Button size="sm" variant="ghost" onClick={loadCampaigns}><RefreshCw className="h-4 w-4"/></Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-zinc-400 border-b border-zinc-800"><th className="text-left py-2 px-2">Time</th><th className="text-left py-2 px-2">Segment</th><th className="text-left py-2 px-2">Subject</th><th className="text-left py-2 px-2">Sent</th><th className="text-left py-2 px-2">Failed</th><th className="text-left py-2 px-2">Status</th></tr></thead>
              <tbody>
                {campaigns.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-zinc-500">No campaigns yet.</td></tr>}
                {campaigns.map(c => (
                  <tr key={c.id} className="border-b border-zinc-900 text-zinc-300">
                    <td className="py-2 px-2 text-xs">{new Date(c.created_at).toLocaleString('en-IN')}</td>
                    <td className="py-2 px-2 text-xs">{c.segment}</td>
                    <td className="py-2 px-2 text-xs max-w-xs truncate">{c.subject}</td>
                    <td className="py-2 px-2 text-green-400">{c.sent_count}/{c.total_recipients}</td>
                    <td className="py-2 px-2 text-red-400">{c.failed_count}</td>
                    <td className="py-2 px-2">
                      {c.status === 'completed' && <Badge className="bg-green-600 text-xs"><CheckCircle2 className="h-3 w-3 mr-1"/>Done</Badge>}
                      {c.status === 'failed' && <Badge className="bg-red-600 text-xs"><XCircle className="h-3 w-3 mr-1"/>Failed</Badge>}
                      {c.status === 'sending' && <Badge className="bg-amber-600 text-xs">Sending</Badge>}
                    </td>
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

export default AdminBroadcastMail;
