// @ts-nocheck
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import { Loader2, Smartphone, Save, Send } from 'lucide-react';

export function AdminMobileAppUpdate() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [cfg, setCfg] = useState<any>({
    android_current_version: '1.0.0', android_minimum_version: '1.0.0', android_store_url: '',
    ios_current_version: '1.0.0', ios_minimum_version: '1.0.0', ios_store_url: '',
    force_update: false,
    update_title: 'New Update Available',
    update_message: 'Please update to the latest version for the best experience.',
  });

  // Admin panel uses hotkey session (no Supabase JWT), so RLS blocks direct
  // reads/writes on mobile_app_config. Route everything through the
  // admin-security-manage edge function which validates the hotkey/url_key.
  const getAdminAuthBody = () => {
    let url_key = '';
    try {
      const m = window.location.pathname.match(/\/admin\/hotkey\/([^/]+)/);
      if (m) url_key = m[1];
      if (!url_key) {
        const stored = sessionStorage.getItem('admin_user');
        if (stored) url_key = JSON.parse(stored)?.uniqueCode || '';
      }
    } catch { /* ignore */ }
    return { url_key, admin_code: url_key };
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.functions.invoke('admin-security-manage', {
        body: { action: 'load_mobile_config', ...getAdminAuthBody() },
      });
      if (data?.config) setCfg((prev: any) => ({ ...prev, ...data.config }));
      setLoading(false);
    })();
  }, []);

  const doSave = async () => {
    const { data, error } = await supabase.functions.invoke('admin-security-manage', {
      body: { action: 'save_mobile_config', config: cfg, ...getAdminAuthBody() },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
  };

  const save = async () => {
    setSaving(true);
    try {
      await doSave();
      toast.success('Mobile app config saved. RN clients will pick up on next check.');
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const publishAndNotify = async () => {
    setSending(true);
    try {
      await doSave();
      const { data, error } = await supabase.functions.invoke('admin-push-send', {
        body: {
          title: cfg.update_title || 'New Update Available',
          description: `${cfg.update_message}\n\nLatest: Android ${cfg.android_current_version} • iOS ${cfg.ios_current_version}`,
          targetUrl: 'app://check-update',
        },
      });
      if (error) throw error;
      toast.success(`Update pushed to ${data?.totalDelivered ?? 0}/${data?.totalSubscribers ?? 0} devices.`);
    } catch (e: any) {
      toast.error(e?.message || 'Broadcast failed');
    } finally {
      setSending(false);
    }
  };

  const upd = (k: string, v: any) => setCfg({ ...cfg, [k]: v });

  if (loading) return <div className="flex items-center gap-2 text-slate-400"><Loader2 className="size-4 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Smartphone className="size-6 text-blue-400" />
        <h2 className="text-2xl font-bold text-white">Mobile App Update</h2>
      </div>

      <Card className="bg-slate-900/60 border-blue-500/20 p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-blue-400">Android</h3>
            <div><Label>Current Version</Label>
              <Input value={cfg.android_current_version} onChange={e => upd('android_current_version', e.target.value)} /></div>
            <div><Label>Minimum Version</Label>
              <Input value={cfg.android_minimum_version} onChange={e => upd('android_minimum_version', e.target.value)} /></div>
            <div><Label>Play Store URL</Label>
              <Input value={cfg.android_store_url} onChange={e => upd('android_store_url', e.target.value)}
                placeholder="https://play.google.com/store/apps/details?id=..." /></div>
          </div>
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-blue-400">iOS</h3>
            <div><Label>Current Version</Label>
              <Input value={cfg.ios_current_version} onChange={e => upd('ios_current_version', e.target.value)} /></div>
            <div><Label>Minimum Version</Label>
              <Input value={cfg.ios_minimum_version} onChange={e => upd('ios_minimum_version', e.target.value)} /></div>
            <div><Label>App Store URL</Label>
              <Input value={cfg.ios_store_url} onChange={e => upd('ios_store_url', e.target.value)}
                placeholder="https://apps.apple.com/app/id..." /></div>
          </div>
        </div>

        <div className="border-t border-slate-700 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Force Update</Label>
              <p className="text-xs text-slate-400">Users below minimum version cannot dismiss the update prompt.</p>
            </div>
            <Switch checked={cfg.force_update} onCheckedChange={v => upd('force_update', v)} />
          </div>
          <div><Label>Update Title</Label>
            <Input value={cfg.update_title} onChange={e => upd('update_title', e.target.value)} /></div>
          <div><Label>Update Message</Label>
            <Textarea rows={3} value={cfg.update_message} onChange={e => upd('update_message', e.target.value)} /></div>
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-2">
          <Button onClick={save} disabled={saving || sending} variant="outline" className="border-blue-500/40">
            {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Save className="size-4 mr-2" />}
            Save Config
          </Button>
          <Button onClick={publishAndNotify} disabled={saving || sending} className="bg-green-600 hover:bg-green-700">
            {sending ? <Loader2 className="size-4 animate-spin mr-2" /> : <Send className="size-4 mr-2" />}
            Publish & Notify All Users
          </Button>
        </div>

        <div className="text-xs text-slate-500 border-t border-slate-700 pt-3">
          Public API: <code>GET /functions/v1/mobile-version</code>
        </div>
      </Card>
    </div>
  );
}

export default AdminMobileAppUpdate;
