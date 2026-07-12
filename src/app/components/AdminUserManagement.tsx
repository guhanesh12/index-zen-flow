// @ts-nocheck
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { toast } from 'sonner';
import {
  Loader2, Plus, Edit, Trash2, RotateCcw, Shield, ShieldCheck, Crown, Copy,
  CheckCircle2, XCircle, KeyRound, Fingerprint, Link2, Search, RefreshCw, Circle,
  LayoutGrid,
} from 'lucide-react';
import { TAB_TREE, tabModule, subTabModule } from '@/app/adminTabs';

const MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'users', label: 'Users' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'wallet', label: 'Wallet' },
  { key: 'referrals', label: 'Referrals' },
  { key: 'instruments', label: 'Instruments' },
  { key: 'journals', label: 'Journals' },
  { key: 'support', label: 'Support' },
  { key: 'landing', label: 'Landing Page' },
  { key: 'communication', label: 'Communication' },
  { key: 'mobile', label: 'Mobile App' },
  { key: 'adminUsers', label: 'Admin Users' },
  { key: 'adminManagement', label: 'Admin Management' },
  { key: 'security', label: 'Security' },
  { key: 'audit', label: 'Audit Log' },
  { key: 'settings', label: 'Settings' },
] as const;
const ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'approve'] as const;
const COL: Record<string, string> = {
  view: 'can_view', create: 'can_create', edit: 'can_edit',
  delete: 'can_delete', export: 'can_export', approve: 'can_approve',
};


// Extract the admin URL key from the current pathname (/admin/hotkey/<key>/...)
// or from sessionStorage — required to authenticate hotkey-based admin sessions
// against the admin-security-manage edge function.
const getAdminUrlKey = () => {
  try {
    const adminRaw = sessionStorage.getItem('admin_user');
    if (adminRaw) {
      const admin = JSON.parse(adminRaw);
      if (admin?.uniqueCode) return String(admin.uniqueCode);
    }
    const m = window.location.pathname.match(/\/admin\/hotkey\/([^/]+)/);
    if (m?.[1]) return m[1];
    return sessionStorage.getItem('admin_unique_code') || '';
  } catch { return ''; }
};
const callAdmin = (body: any) =>
  supabase.functions.invoke('admin-security-manage', {
    headers: sessionStorage.getItem('admin_access_token')
      ? { Authorization: `Bearer ${sessionStorage.getItem('admin_access_token')}` }
      : undefined,
    body: { url_key: getAdminUrlKey(), admin_code: getAdminUrlKey(), ...body },
  });



interface AdminRow {
  user_id: string; email: string; full_name: string | null; mobile: string | null;
  role_label: string | null; status: string; is_super_admin: boolean;
  hotkey?: string | null; username?: string | null; employee_code?: string | null;
  url_key?: string | null; is_online?: boolean; last_seen_at?: string | null;
  last_login_at?: string | null; last_login_ip?: string | null; last_login_url?: string | null;
}

const empty = {
  email: '', full_name: '', mobile: '', role_label: 'admin',
  password: '', confirm: '', hotkey: '', username: '', employee_code: '',
};

export function AdminUserManagement() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'activity'>('list');
  const [search, setSearch] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  const [selected, setSelected] = useState<AdminRow | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [hkCheck, setHkCheck] = useState<{ state: 'idle' | 'checking' | 'ok' | 'taken'; msg?: string }>({ state: 'idle' });
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({});
  // Tab visibility toggles used inside the Create/Edit dialog.
  // Shape: { mainKey: boolean, `${mainKey}:${subKey}`: boolean }
  const [tabAccess, setTabAccess] = useState<Record<string, boolean>>(() => {
    const seed: Record<string, boolean> = {};
    TAB_TREE.forEach(t => { seed[t.key] = true; t.subs.forEach(s => { seed[`${t.key}:${s.key}`] = true; }); });
    return seed;
  });
  const [saving, setSaving] = useState(false);
  const [activity, setActivity] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await callAdmin({ action: 'list_admins' });
    if (error) toast.error(error.message);
    setAdmins((data?.admins as any) || []);
    setLoading(false);
  };
  const loadActivity = async () => {
    const { data } = await callAdmin({ action: 'list_activity' });
    setActivity((data?.activity as any) || []);
  };
  useEffect(() => { load(); loadActivity(); }, []);
  useEffect(() => {
    const ch = supabase.channel('admin-mgmt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_profiles' }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_access_log' }, loadActivity)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const superAdmin = useMemo(() => admins.find(a => a.is_super_admin), [admins]);
  const others = useMemo(() => admins.filter(a => !a.is_super_admin), [admins]);
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return others;
    return others.filter(a => JSON.stringify(a).toLowerCase().includes(q));
  }, [others, search]);

  // --- CRUD ---
  const resetTabAccessAllOn = () => {
    const seed: Record<string, boolean> = {};
    TAB_TREE.forEach(t => { seed[t.key] = true; t.subs.forEach(s => { seed[`${t.key}:${s.key}`] = true; }); });
    setTabAccess(seed);
  };
  const loadTabAccessForUser = async (uid: string) => {
    const { data } = await supabase
      .from('admin_permissions')
      .select('module,can_view')
      .eq('admin_user_id', uid)
      .like('module', 'tab:%');
    // Default everything ON; then apply saved values (rows explicitly toggled off will disable).
    const map: Record<string, boolean> = {};
    TAB_TREE.forEach(t => { map[t.key] = true; t.subs.forEach(s => { map[`${t.key}:${s.key}`] = true; }); });
    (data || []).forEach((r: any) => {
      const m: string = r.module;
      // module = 'tab:<key>' or 'tab:<key>:<sub>'
      const rest = m.slice(4);
      if (rest.includes(':')) {
        const [p, s] = rest.split(':');
        map[`${p}:${s}`] = !!r.can_view;
      } else {
        map[rest] = !!r.can_view;
      }
    });
    setTabAccess(map);
  };
  const openCreate = () => {
    setSelected(null); setForm({ ...empty });
    setHkCheck({ state: 'idle' });
    resetTabAccessAllOn();
    setEditOpen(true);
  };
  const openEdit = async (a: AdminRow) => {
    setSelected(a);
    setForm({
      email: a.email, full_name: a.full_name || '', mobile: a.mobile || '',
      role_label: a.role_label || 'admin', password: '', confirm: '',
      hotkey: a.hotkey || '', username: a.username || '',
      employee_code: a.employee_code || '',
    });
    setHkCheck({ state: 'idle' });
    resetTabAccessAllOn();
    await loadTabAccessForUser(a.user_id);
    setEditOpen(true);
  };

  const checkHotkey = async () => {
    const hk = form.hotkey.trim();
    if (!hk) return setHkCheck({ state: 'taken', msg: 'Enter a hotkey first' });
    setHkCheck({ state: 'checking' });
    const { data, error } = await callAdmin({ action: 'check_hotkey', hotkey: hk, exclude_user_id: selected?.user_id });
    if (error) return setHkCheck({ state: 'taken', msg: error.message });
    if (data?.available) setHkCheck({ state: 'ok', msg: 'Available ✓' });
    else setHkCheck({ state: 'taken', msg: `Taken by ${data?.taken_by || 'another admin'}` });
  };

  const persistTabAccess = async (uid: string) => {
    // One row per main tab + one row per sub-tab. can_view carries the switch.
    const rows: any[] = [];
    TAB_TREE.forEach(t => {
      rows.push({ admin_user_id: uid, module: tabModule(t.key),
        can_view: !!tabAccess[t.key], can_create: false, can_edit: false, can_delete: false, can_export: false, can_approve: false });
      t.subs.forEach(s => {
        rows.push({ admin_user_id: uid, module: subTabModule(t.key, s.key),
          can_view: !!tabAccess[`${t.key}:${s.key}`], can_create: false, can_edit: false, can_delete: false, can_export: false, can_approve: false });
      });
    });
    await supabase.from('admin_permissions').upsert(rows, { onConflict: 'admin_user_id,module' });
  };

  const save = async () => {
    if (!selected) {
      // Create
      if (!form.email || !form.password || !form.username || !form.hotkey || !form.full_name) {
        return toast.error('Fill name, email, username, password, hotkey');
      }
      if (form.password !== form.confirm) return toast.error('Passwords do not match');
      if (form.password.length < 8) return toast.error('Password must be 8+ characters');
      if (hkCheck.state !== 'ok') return toast.error('Verify hotkey availability first');
      setSaving(true);
      const { data, error } = await callAdmin({ action: 'create_admin', ...form });
      if (error || !data?.success) { setSaving(false); return toast.error((data?.error) || error?.message || 'Create failed'); }
      const newUid = data?.user_id || data?.admin?.user_id || data?.admin?.id;
      if (newUid) {
        try { await persistTabAccess(newUid); } catch (e:any) { console.warn('tab access save failed', e); }
      }
      setSaving(false);
      toast.success('Admin created with tab access. Share the URL key & credentials securely.');
    } else {
      setSaving(true);
      const { data, error } = await callAdmin({
          action: 'update_admin', user_id: selected.user_id,
          full_name: form.full_name, mobile: form.mobile, role_label: form.role_label,
          employee_code: form.employee_code, username: form.username, hotkey: form.hotkey,
      });
      if (error || !data?.success) { setSaving(false); return toast.error((data?.error) || error?.message || 'Update failed'); }
      if (form.password) {
        if (form.password !== form.confirm) { setSaving(false); return toast.error('Passwords do not match'); }
        await callAdmin({ action: 'set_password', user_id: selected.user_id, password: form.password });
      }
      try { await persistTabAccess(selected.user_id); } catch (e:any) { console.warn('tab access save failed', e); }
      setSaving(false);
      toast.success('Admin updated');
    }
    setEditOpen(false); load();
  };

  const toggleStatus = async (a: AdminRow) => {
    if (a.is_super_admin) return toast.error('Cannot disable super admin');
    const next = a.status === 'active' ? 'disabled' : 'active';
    await callAdmin({ action: 'update_admin', user_id: a.user_id, status: next });
    toast.success(`Admin ${next}`); load();
  };

  const removeAdmin = async (a: AdminRow) => {
    if (a.is_super_admin) return toast.error('Cannot delete super admin');
    if (!confirm(`Delete admin ${a.email}? This cannot be undone.`)) return;
    const { data, error } = await callAdmin({ action: 'delete_admin', user_id: a.user_id });
    if (error || !data?.success) return toast.error((data?.error) || error?.message || 'Delete failed');
    toast.success('Admin deleted'); load();
  };

  const resetTotp = async (a: AdminRow) => {
    if (!confirm(`Reset Google Authenticator for ${a.email}?\nThey will scan a new QR on next login.`)) return;
    const { data, error } = await callAdmin({ action: 'reset_totp', user_id: a.user_id });
    if (error || !data?.success) return toast.error((data?.error) || error?.message || 'Reset failed');
    toast.success('2FA reset — new QR on next login');
  };

  const rotateKey = async (a: AdminRow) => {
    if (!confirm(`Rotate URL login key for ${a.email}?\nOld key will stop working.`)) return;
    const { data, error } = await callAdmin({ action: 'rotate_url_key', user_id: a.user_id });
    if (error || !data?.success) return toast.error((data?.error) || error?.message || 'Failed');
    toast.success(`New URL key: ${data.url_key}`); load();
  };

  // --- Permissions ---
  const openPerms = async (a: AdminRow) => {
    setSelected(a);
    const { data } = await supabase.from('admin_permissions').select('*').eq('admin_user_id', a.user_id);
    const map: Record<string, Record<string, boolean>> = {};
    MODULES.forEach(m => {
      const row = (data || []).find((r: any) => r.module === m.key);
      map[m.key] = {};
      ACTIONS.forEach(act => { map[m.key][act] = a.is_super_admin ? true : !!row?.[COL[act]]; });
    });
    setPermissions(map); setPermOpen(true);
  };
  const togglePerm = (m: string, act: string) => setPermissions(p => ({ ...p, [m]: { ...p[m], [act]: !p[m][act] } }));
  const toggleAllModule = (m: string, on: boolean) => {
    setPermissions(p => ({ ...p, [m]: Object.fromEntries(ACTIONS.map(a => [a, on])) as any }));
  };
  const savePerms = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      for (const m of MODULES) {
        const row: any = { admin_user_id: selected.user_id, module: m.key };
        ACTIONS.forEach(a => row[COL[a]] = !!permissions[m.key]?.[a]);
        await supabase.from('admin_permissions').upsert(row, { onConflict: 'admin_user_id,module' });
      }
      toast.success('Permissions saved'); setPermOpen(false);
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success('Copied'); };

  const AdminCard = ({ a, isSuper }: { a: AdminRow; isSuper?: boolean }) => {
    const loginUrl = a.url_key ? `${window.location.origin}/admin/hotkey/${a.url_key}` : null;
    return (
      <Card className={`p-4 border ${isSuper ? 'bg-gradient-to-br from-amber-500/10 to-orange-500/5 border-amber-500/40' : 'bg-slate-900/60 border-slate-700/60'}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={`size-12 rounded-full flex items-center justify-center ${isSuper ? 'bg-amber-500/20' : 'bg-blue-500/20'}`}>
              {isSuper ? <Crown className="size-6 text-amber-400" /> : <Shield className="size-6 text-blue-400" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white font-semibold text-lg truncate">{a.full_name || a.username || a.email}</span>
                {isSuper && <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">SUPER ADMIN</Badge>}
                <Badge className={a.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>{a.status}</Badge>
                <span className="flex items-center gap-1 text-xs">
                  <Circle className={`size-2 fill-current ${a.is_online ? 'text-green-400' : 'text-gray-500'}`} />
                  <span className={a.is_online ? 'text-green-400' : 'text-gray-500'}>{a.is_online ? 'online' : 'offline'}</span>
                </span>
              </div>
              <div className="text-sm text-slate-400 mt-1">{a.email}</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 mt-3 text-xs">
                <Info label="Employee" value={a.employee_code} />
                <Info label="Username" value={a.username} />
                <Info label="Mobile" value={a.mobile} />
                <Info label="Role" value={a.role_label} />
                <Info label="Last Login" value={a.last_login_at ? new Date(a.last_login_at).toLocaleString() : '—'} />
                <Info label="Last IP" value={a.last_login_ip} />
              </div>
              <div className="mt-3 space-y-1.5">
                {a.hotkey && (
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <Fingerprint className="size-3.5 text-purple-400" />
                    <code className="bg-slate-800 px-2 py-0.5 rounded text-purple-300">Ctrl+Alt+{a.hotkey}</code>
                    <span className="text-slate-500">Win</span>
                    <code className="bg-slate-800 px-2 py-0.5 rounded text-purple-300">Cmd+Option+{a.hotkey}</code>
                    <span className="text-slate-500">Mac</span>
                  </div>
                )}
                {loginUrl && (
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <Link2 className="size-3.5 text-cyan-400" />
                    <code className="bg-slate-800 px-2 py-0.5 rounded text-cyan-300 max-w-[380px] truncate">{loginUrl}</code>
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => copy(loginUrl!)}><Copy className="size-3" /></Button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => openPerms(a)}><ShieldCheck className="size-4 mr-1" />Permissions</Button>
            <Button size="sm" variant="outline" onClick={() => openEdit(a)}><Edit className="size-4 mr-1" />Edit</Button>
            <Button size="sm" variant="outline" onClick={() => resetTotp(a)}><KeyRound className="size-4 mr-1" />Reset 2FA</Button>
            {!isSuper && (
              <>
                <Button size="sm" variant="outline" onClick={() => rotateKey(a)}><RotateCcw className="size-4 mr-1" />Rotate URL</Button>
                <Button size="sm" variant="outline" onClick={() => toggleStatus(a)}>
                  {a.status === 'active' ? <XCircle className="size-4 mr-1" /> : <CheckCircle2 className="size-4 mr-1" />}
                  {a.status === 'active' ? 'Disable' : 'Enable'}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => removeAdmin(a)}><Trash2 className="size-4" /></Button>
              </>
            )}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2"><ShieldCheck className="size-6 text-blue-400" />Admin Management</h2>
          <p className="text-sm text-slate-400 mt-1">Hotkey-locked admin accounts. Each admin has a unique URL key, hotkey, username & 2FA.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { load(); loadActivity(); }} variant="outline"><RefreshCw className="size-4 mr-1" />Refresh</Button>
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700"><Plus className="size-4 mr-1" />New Admin</Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
        <TabsList>
          <TabsTrigger value="list">Admins ({admins.length})</TabsTrigger>
          <TabsTrigger value="activity">Login Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-3 mt-3">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="size-5 animate-spin mr-2" />Loading admins…
            </div>
          ) : (
            <>
              {superAdmin && <AdminCard a={superAdmin} isSuper />}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <Input className="pl-9" placeholder="Search admins by name, email, mobile, hotkey…" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
              </div>
              {filtered.length === 0 && (
                <Card className="p-6 text-center text-slate-500 bg-slate-900/40 border-slate-800">No additional admins. Click "New Admin" to create one.</Card>
              )}
              {filtered.map(a => <AdminCard key={a.user_id} a={a} />)}
            </>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-3">
          <Card className="p-4 bg-slate-900/60 border-slate-700/60">
            <div className="max-h-[70vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>URL Key</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activity.map(r => {
                    const who = admins.find(a => a.user_id === r.admin_user_id || a.email === r.admin_email);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                        <TableCell className="text-xs">{who?.full_name || r.admin_email || '—'}</TableCell>
                        <TableCell className="text-xs">{who?.mobile || '—'}</TableCell>
                        <TableCell className="text-xs">{who?.employee_code || '—'}</TableCell>
                        <TableCell className="text-xs"><Badge className="bg-slate-700 text-slate-200">{r.event || r.action || 'access'}</Badge></TableCell>
                        <TableCell className="text-xs font-mono max-w-[220px] truncate">{r.url || '—'}</TableCell>
                        <TableCell className="text-xs font-mono">{r.url_key || '—'}</TableCell>
                        <TableCell className="text-xs">{r.ip_address || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                  {!activity.length && (
                    <TableRow><TableCell colSpan={8} className="text-center py-6 text-slate-500">No activity yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ---------- Create / Edit dialog ---------- */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl bg-slate-900 border-slate-700 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">{selected ? `Edit ${selected.email}` : 'Create New Admin'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full Name *" value={form.full_name} onChange={v => setForm(f => ({ ...f, full_name: v }))} />
            <Field label="Employee Code" value={form.employee_code} onChange={v => setForm(f => ({ ...f, employee_code: v.toUpperCase() }))} placeholder="EMP001" />
            <Field label="Email *" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} disabled={!!selected} />
            <Field label="Mobile" value={form.mobile} onChange={v => setForm(f => ({ ...f, mobile: v }))} placeholder="+91…" />
            <Field label="Username *" value={form.username} onChange={v => setForm(f => ({ ...f, username: v.toLowerCase() }))} />
            <Field label="Role Label" value={form.role_label} onChange={v => setForm(f => ({ ...f, role_label: v }))} placeholder="admin / manager" />
            <Field label={selected ? 'New Password (leave blank to keep)' : 'Password *'} type="password" value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} />
            <Field label="Confirm Password" type="password" value={form.confirm} onChange={v => setForm(f => ({ ...f, confirm: v }))} />

            <div className="col-span-2 border-t border-slate-800 pt-3">
              <Label className="text-slate-200 flex items-center gap-2"><Fingerprint className="size-4 text-purple-400" />Hotkey (unique per admin)</Label>
              <div className="flex gap-2 mt-2">
                <Input value={form.hotkey} onChange={e => { setForm(f => ({ ...f, hotkey: e.target.value.toUpperCase() })); setHkCheck({ state: 'idle' }); }} placeholder="e.g. GUHAN" className="uppercase" />
                <Button type="button" variant="outline" onClick={checkHotkey} disabled={hkCheck.state === 'checking'}>
                  {hkCheck.state === 'checking' ? <Loader2 className="size-4 animate-spin" /> : 'Verify'}
                </Button>
              </div>
              {hkCheck.state !== 'idle' && hkCheck.state !== 'checking' && (
                <div className={`text-xs mt-1 flex items-center gap-1 ${hkCheck.state === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                  {hkCheck.state === 'ok' ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                  {hkCheck.msg}
                </div>
              )}
              {form.hotkey && (
                <div className="mt-2 text-xs text-slate-400 space-y-1">
                  <div>Windows: <code className="bg-slate-800 px-2 py-0.5 rounded text-purple-300">Ctrl+Alt+{form.hotkey}</code></div>
                  <div>Mac: <code className="bg-slate-800 px-2 py-0.5 rounded text-purple-300">Cmd+Option+{form.hotkey}</code></div>
                  <div className="text-amber-400/80">This hotkey + username + password + 2FA combo is the ONLY way this admin can log in.</div>
                </div>
              )}
            </div>

            {/* ---------- Tab Access ---------- */}
            <div className="col-span-2 border-t border-slate-800 pt-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-slate-200 flex items-center gap-2">
                  <LayoutGrid className="size-4 text-blue-400" />
                  Tab Access — only ON tabs will show for this admin
                </Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => {
                    const s: Record<string, boolean> = {};
                    TAB_TREE.forEach(t => { s[t.key] = true; t.subs.forEach(x => { s[`${t.key}:${x.key}`] = true; }); });
                    setTabAccess(s);
                  }}>All On</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => {
                    const s: Record<string, boolean> = {};
                    TAB_TREE.forEach(t => { s[t.key] = false; t.subs.forEach(x => { s[`${t.key}:${x.key}`] = false; }); });
                    setTabAccess(s);
                  }}>All Off</Button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[42vh] overflow-auto pr-1">
                {TAB_TREE.map(t => (
                  <div key={t.key} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-white">{t.label}</div>
                      <Switch
                        checked={!!tabAccess[t.key]}
                        onCheckedChange={(v) => {
                          setTabAccess(prev => {
                            const next = { ...prev, [t.key]: v };
                            // Cascade to subs so parent-off hides everything under it.
                            t.subs.forEach(s => { next[`${t.key}:${s.key}`] = v; });
                            return next;
                          });
                        }}
                      />
                    </div>
                    {t.subs.length > 0 && (
                      <div className="mt-2 pl-2 border-l border-slate-800 space-y-1.5">
                        {t.subs.map(s => (
                          <div key={s.key} className="flex items-center justify-between">
                            <div className="text-xs text-slate-300">{s.label}</div>
                            <Switch
                              checked={!!tabAccess[`${t.key}:${s.key}`]}
                              disabled={!tabAccess[t.key]}
                              onCheckedChange={(v) => setTabAccess(prev => ({ ...prev, [`${t.key}:${s.key}`]: v }))}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="text-xs text-slate-500 mt-2">Turning a main tab off automatically hides all its sub-tabs.</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving && <Loader2 className="size-4 animate-spin mr-2" />}
              {selected ? 'Save Changes' : 'Create Admin'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Permissions dialog ---------- */}
      <Dialog open={permOpen} onOpenChange={setPermOpen}>
        <DialogContent className="max-w-4xl bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Permissions — {selected?.email}</DialogTitle>
          </DialogHeader>
          {selected?.is_super_admin && (
            <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded p-2">Super admin has ALL permissions and cannot be restricted.</div>
          )}
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Module</TableHead>
                  <TableHead className="text-center">All</TableHead>
                  {ACTIONS.map(a => <TableHead key={a} className="text-center capitalize">{a}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {MODULES.map(m => {
                  const allOn = ACTIONS.every(a => permissions[m.key]?.[a]);
                  return (
                    <TableRow key={m.key}>
                      <TableCell className="text-slate-200 font-medium">{m.label}</TableCell>
                      <TableCell className="text-center">
                        <Switch checked={allOn} disabled={selected?.is_super_admin} onCheckedChange={(v) => toggleAllModule(m.key, v)} />
                      </TableCell>
                      {ACTIONS.map(act => (
                        <TableCell key={act} className="text-center">
                          <Switch checked={!!permissions[m.key]?.[act]} disabled={selected?.is_super_admin} onCheckedChange={() => togglePerm(m.key, act)} />
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermOpen(false)}>Close</Button>
            <Button onClick={savePerms} disabled={saving || selected?.is_super_admin} className="bg-blue-600 hover:bg-blue-700">
              {saving && <Loader2 className="size-4 animate-spin mr-2" />}Save Permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder, disabled }: any) {
  return (
    <div>
      <Label className="text-slate-300 text-xs">{label}</Label>
      <Input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} className="mt-1" />
    </div>
  );
}
function Info({ label, value }: { label: string; value: any }) {
  return (
    <div className="min-w-0">
      <div className="text-slate-500 uppercase tracking-wide text-[10px]">{label}</div>
      <div className="text-slate-300 truncate">{value || '—'}</div>
    </div>
  );
}

export default AdminUserManagement;
