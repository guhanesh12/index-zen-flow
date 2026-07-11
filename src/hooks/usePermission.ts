import { useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type PermAction = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'approve';
export type PermModule =
  | 'dashboard' | 'users' | 'transactions' | 'support' | 'landing'
  | 'adminUsers' | 'adminManagement' | 'settings' | 'referrals'
  | 'communication' | 'mobile' | 'security' | 'audit';

const cache = new Map<string, boolean>();
const COL: Record<PermAction, string> = {
  view: 'can_view', create: 'can_create', edit: 'can_edit',
  delete: 'can_delete', export: 'can_export', approve: 'can_approve',
};

async function fetchPerm(userId: string, module: PermModule, action: PermAction) {
  const key = `${userId}:${module}:${action}`;
  if (cache.has(key)) return cache.get(key)!;
  // super admin bypass
  const { data: sa } = await supabase
    .from('admin_profiles')
    .select('is_super_admin,status')
    .eq('user_id', userId)
    .maybeSingle();
  if (sa?.is_super_admin && sa?.status === 'active') {
    cache.set(key, true);
    return true;
  }
  const { data } = await supabase
    .from('admin_permissions')
    .select(COL[action])
    .eq('admin_user_id', userId)
    .eq('module', module)
    .maybeSingle();
  const ok = !!(data as any)?.[COL[action]];
  cache.set(key, ok);
  return ok;
}

export function usePermission(module: PermModule, action: PermAction = 'view') {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    let m = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) { if (m) setAllowed(false); return; }
      const ok = await fetchPerm(uid, module, action);
      if (m) setAllowed(ok);
    })();
    return () => { m = false; };
  }, [module, action]);
  return { allowed, loading: allowed === null };
}

export function clearPermissionCache() { cache.clear(); }

interface ProtectedProps {
  module: PermModule;
  action?: PermAction;
  fallback?: ReactNode;
  children: ReactNode;
}
export function Protected({ module, action = 'view', fallback = null, children }: ProtectedProps) {
  const { allowed, loading } = usePermission(module, action);
  if (loading) return null;
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
