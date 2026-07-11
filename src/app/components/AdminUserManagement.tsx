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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { toast } from 'sonner';
import { Loader2, Plus, KeyRound, ShieldOff, ShieldCheck, Edit, RotateCcw, Trash2 } from 'lucide-react';

const MODULES = [
  'dashboard','users','transactions','support','landing',
  'adminUsers','adminManagement','settings','referrals',
  'communication','mobile','security','audit',
] as const;
const ACTIONS = ['view','create','edit','delete','export','approve'] as const;
const COL: Record<string,string> = {
  view:'can_view',create:'can_create',edit:'can_edit',
  delete:'can_delete',export:'can_export',approve:'can_approve',
};

interface AdminRow {
  user_id: string;
  email: string;
  full_name: string | null;
  mobile: string | null;
  role_label: string | null;
  status: string;
  is_super_admin: boolean;
  hotkey?: string;
}

export function AdminUserManagement({ currentAdmin }: { currentAdmin?: any }) {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  const [selected, setSelected] = useState<AdminRow | null>(null);
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [savingPerm, setSavingPerm] = useState(false);

  // form
  const [form, setForm] = useState({
    email: '', full_name: '', mobile: '', role_label: 'admin',
    password: '', hotkey: '',
  });

  const load = async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from('admin_profiles')
      .select('*')
      .order('created_at', { ascending: false });
    // hotkeys from kv (best-effort)
    setAdmins((profiles || []) as any);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setSelected(null);
    setForm({ email: '', full_name: '', mobile: '', role_label: 'admin', password: '', hotkey: '' });
    setEditOpen(true);
  };
  const openEdit = (a: AdminRow) => {
    setSelected(a);
    setForm({
      email: a.email, full_name: a.full_name || '', mobile: a.mobile || '',
      role_label: a.role_label || 'admin', password: '', hotkey: a.hotkey || '',
    });
    setEditOpen(true);
  };

  const validateUnique = async (): Promise<string | null> => {
    // unique email
    const { data: emailDup } = await supabase
      .from('admin_profiles').select('user_id')
      .eq('email', form.email.trim().toLowerCase())
      .maybeSingle();
    if (emailDup && emailDup.user_id !== selected?.user_id) return 'Email already used by another admin.';
    if (form.hotkey) {
      const { data: hkDup } = await supabase
        .from('admin_profiles').select('user_id, email')
        .eq('mobile', '') // placeholder — hotkey uniqueness handled server-side
        .maybeSingle();
      // client-side: rely on server unique constraint if present; also check kv table client-side
    }
    return null;
  };

  const save = async () => {
    if (!form.email) return toast.error('Email required');
    const err = await validateUnique();
    if (err) return toast.error(err);

    if (!selected) {
      // create via edge function (needs service role to create auth user)
      const { data, error } = await supabase.functions.invoke('admin-security-manage', {
        body: { op: 'create_admin', ...form },
      });
      if (error || !data?.success) return toast.error(data?.message || error?.message || 'Create failed');
      toast.success('Admin created. They must scan Google Authenticator on first login.');
    } else {
      const { error } = await supabase
        .from('admin_profiles')
        .update({
          full_name: form.full_name, mobile: form.mobile,
          role_label: form.role_label,
        })
        .eq('user_id', selected.user_id);
      if (error) return toast.error(error.message);
      if (form.password) {
        await supabase.functions.invoke('admin-security-manage', {
          body: { op: 'set_password', user_id: selected.user_id, password: form.password },
        });
      }
      if (form.hotkey) {
        await supabase.functions.invoke('admin-security-manage', {
          body: { op: 'set_hotkey', user_id: selected.user_id, hotkey: form.hotkey },
        });
      }
      toast.success('Admin updated');
    }
    setEditOpen(false);
    load();
  };

  const toggleStatus = async (a: AdminRow) => {
    if (a.is_super_admin) return toast.error('Cannot disable super admin');
    const next = a.status === 'active' ? 'disabled' : 'active';
    const { error } = await supabase
      .from('admin_profiles')
      .update({ status: next })
      .eq('user_id', a.user_id);
    if (error) return toast.error(error.message);
    await supabase.from('admin_audit_events').insert({
      action: next === 'active' ? 'admin_enabled' : 'admin_disabled',
      module: 'adminManagement', target_user_id: a.user_id, status: 'success',
    });
    toast.success(`Admin ${next}`);
    load();
  };

  const removeAdmin = async (a: AdminRow) => {
    if (a.is_super_admin) return toast.error('Cannot delete super admin');
    if (!confirm(`Delete admin ${a.email}?`)) return;
    const { data, error } = await supabase.functions.invoke('admin-security-manage', {
      body: { op: 'delete_admin', user_id: a.user_id },
    });
    if (error || !data?.success) return toast.error(data?.message || error?.message || 'Delete failed');
    toast.success('Admin deleted');
    load();
  };

  const resetTotp = async (a: AdminRow) => {
    if (!confirm(`Reset Google Authenticator for ${a.email}? They will scan a new QR on next login.`)) return;
    const { error } = await supabase.from('admin_totp_secrets').delete().eq('user_id', a.user_id);
    if (error) return toast.error(error.message);
    await supabase.from('admin_audit_events').insert({
      action: 'totp_reset', module: 'adminManagement', target_user_id: a.user_id, status: 'success',
    });
    toast.success('TOTP reset. New QR on next login.');
  };

  const openPerms = async (a: AdminRow) => {
    setSelected(a);
    const { data } = await supabase
      .from('admin_permissions')
      .select('*')
      .eq('admin_user_id', a.user_id);
    const map: Record<string, Record<string, boolean>> = {};
    MODULES.forEach(m => {
      const row = (data || []).find((r: any) => r.module === m);
      map[m] = {};
      ACTIONS.forEach(act => {
        map[m][act] = a.is_super_admin ? true : !!row?.[COL[act]];
      });
    });
    setPermissions(map);
    setPermOpen(true);
  };

  const togglePerm = (m: string, act: string) => {
    setPermissions(p => ({ ...p, [m]: { ...p[m], [act]: !p[m][act] } }));
  };

  const savePerms = async () => {
    if (!selected) return;
    setSavingPerm(true);
    try {
      for (const m of MODULES) {
        const row: any = { admin_user_id: selected.user_id, module: m };
        ACTIONS.forEach(a => row[COL[a]] = !!permissions[m]?.[a]);
        await supabase.from('admin_permissions').upsert(row, { onConflict: 'admin_user_id,module' });
      }
      await supabase.from('admin_audit_events').insert({
        action: 'permissions_updated', module: 'adminManagement',
        target_user_id: selected.user_id, status: 'success',
        details: permissions,
      });
      toast.success('Permissions saved');
      setPermOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setSavingPerm(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Admin Management</h2>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="size-4 mr-2" /> New Admin
        </Button>
      </div>

      <Card className="bg-slate-900/60 border-blue-500/20 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader2 className="size-5 animate-spin mr-2" /> Loading admins…
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map(a => (
                <TableRow key={a.user_id}>
                  <TableCell className="text-slate-200">
                    {a.email}
                    {a.is_super_admin && <Badge className="ml-2 bg-yellow-500/20 text-yellow-400">SUPER</Badge>}
                  </TableCell>
                  <TableCell>{a.full_name || '—'}</TableCell>
                  <TableCell>{a.mobile || '—'}</TableCell>
                  <TableCell>{a.role_label || 'admin'}</TableCell>
                  <TableCell>
                    <Badge className={a.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                      {a.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(a)} title="Edit">
                      <Edit className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openPerms(a)} title="Permissions">
                      <KeyRound className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => resetTotp(a)} title="Reset 2FA">
                      <RotateCcw className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleStatus(a)} title="Toggle status" disabled={a.is_super_admin}>
                      {a.status === 'active' ? <ShieldOff className="size-4" /> : <ShieldCheck className="size-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => removeAdmin(a)} title="Delete" disabled={a.is_super_admin}>
                      <Trash2 className="size-4 text-red-400" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-slate-900 border-blue-500/20 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected ? 'Edit Admin' : 'Create Admin'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Email *</Label>
              <Input value={form.email} disabled={!!selected}
                onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Full Name</Label>
              <Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <Label>Mobile</Label>
              <Input value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} />
            </div>
            <div>
              <Label>Role Label</Label>
              <Input value={form.role_label} onChange={e => setForm({ ...form, role_label: e.target.value })} />
            </div>
            <div>
              <Label>{selected ? 'New Password (optional)' : 'Password *'}</Label>
              <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            </div>
            <div>
              <Label>Unique Hotkey (e.g. YGK4LPSQ8D6X)</Label>
              <Input value={form.hotkey} onChange={e => setForm({ ...form, hotkey: e.target.value.toUpperCase() })} />
              <p className="text-xs text-slate-400 mt-1">Each admin has a unique hotkey. Only that hotkey URL will open their login.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={save} className="bg-blue-600 hover:bg-blue-700">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={permOpen} onOpenChange={setPermOpen}>
        <DialogContent className="bg-slate-900 border-blue-500/20 text-white max-w-4xl">
          <DialogHeader>
            <DialogTitle>Permissions — {selected?.email}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Module</TableHead>
                  {ACTIONS.map(a => <TableHead key={a} className="capitalize text-center">{a}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {MODULES.map(m => (
                  <TableRow key={m}>
                    <TableCell className="capitalize font-medium">{m}</TableCell>
                    {ACTIONS.map(a => (
                      <TableCell key={a} className="text-center">
                        <Switch
                          checked={!!permissions[m]?.[a]}
                          onCheckedChange={() => togglePerm(m, a)}
                          disabled={selected?.is_super_admin}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPermOpen(false)}>Cancel</Button>
            <Button onClick={savePerms} disabled={savingPerm || selected?.is_super_admin} className="bg-blue-600 hover:bg-blue-700">
              {savingPerm && <Loader2 className="size-4 animate-spin mr-2" />}
              Save Permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminUserManagement;
