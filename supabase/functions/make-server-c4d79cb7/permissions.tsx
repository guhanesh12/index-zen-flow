// Shared permission enforcement helper.
// Import: import { assertPermission } from './permissions.tsx'
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export type PermAction = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'approve';

const admin = createClient(SUPA_URL, SERVICE_ROLE, { auth: { persistSession: false } });

export async function assertPermission(userId: string, module: string, action: PermAction): Promise<{ ok: boolean; reason?: string }> {
  if (!userId) return { ok: false, reason: 'no_user' };
  const { data: prof } = await admin
    .from('admin_profiles')
    .select('is_super_admin,status')
    .eq('user_id', userId)
    .maybeSingle();
  if (!prof) return { ok: false, reason: 'not_admin' };
  if (prof.status !== 'active') return { ok: false, reason: 'inactive' };
  if (prof.is_super_admin) return { ok: true };

  const col = ({ view:'can_view', create:'can_create', edit:'can_edit', delete:'can_delete', export:'can_export', approve:'can_approve' } as const)[action];
  const { data: perm } = await admin
    .from('admin_permissions')
    .select(col)
    .eq('admin_user_id', userId)
    .eq('module', module)
    .maybeSingle();
  return { ok: !!(perm as any)?.[col], reason: 'forbidden' };
}

export async function auditEvent(entry: {
  actor_user_id?: string; actor_email?: string;
  action: string; module?: string; target_user_id?: string;
  target_resource?: string; status?: 'success' | 'failed' | 'blocked';
  details?: Record<string, unknown>; ip_address?: string; user_agent?: string;
}) {
  try {
    await admin.from('admin_audit_events').insert({
      actor_user_id: entry.actor_user_id || null,
      actor_email: entry.actor_email || null,
      action: entry.action,
      module: entry.module || null,
      target_user_id: entry.target_user_id || null,
      target_resource: entry.target_resource || null,
      status: entry.status || 'success',
      details: entry.details || {},
      ip_address: entry.ip_address || null,
      user_agent: entry.user_agent || null,
    });
  } catch (e) {
    console.warn('auditEvent failed:', e);
  }
}
