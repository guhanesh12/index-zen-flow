import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { tabModule, subTabModule } from '@/app/adminTabs';

interface AllowedTabs {
  loading: boolean;
  isSuperAdmin: boolean;
  hasAnyConfig: boolean;
  allowMain: (key: string) => boolean;
  allowSub:  (parent: string, sub: string) => boolean;
  refresh:   () => void;
}

/**
 * Loads the currently logged-in admin's tab permissions from
 * `admin_permissions` (module = `tab:<key>` or `tab:<key>:<sub>`, can_view=true).
 * Super admins are always allowed everything.
 */
export function useAllowedTabs(): AllowedTabs {
  const [loading, setLoading]     = useState(true);
  const [isSuper, setIsSuper]     = useState(false);
  const [allowed, setAllowed]     = useState<Set<string>>(new Set());
  const [hasConfig, setHasConfig] = useState(false);
  const [tick, setTick]           = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Resolve current admin user_id — prefer sessionStorage.admin_user,
        // fall back to the authenticated supabase user.
        let uid: string | null = null;
        try {
          const raw = sessionStorage.getItem('admin_user');
          if (raw) {
            const j = JSON.parse(raw);
            uid = j?.user_id || j?.id || null;
          }
        } catch { /* ignore */ }
        if (!uid) {
          const { data } = await supabase.auth.getUser();
          uid = data.user?.id || null;
        }
        if (!uid) { if (!cancelled) { setAllowed(new Set()); setIsSuper(false); setLoading(false); } return; }

        const { data: prof } = await supabase
          .from('admin_profiles')
          .select('is_super_admin,status')
          .eq('user_id', uid)
          .maybeSingle();
        const superAdmin = !!(prof?.is_super_admin && prof?.status === 'active');
        if (!cancelled) setIsSuper(superAdmin);

        if (superAdmin) { if (!cancelled) { setAllowed(new Set()); setLoading(false); } return; }

        const { data: rows } = await supabase
          .from('admin_permissions')
          .select('module,can_view')
          .eq('admin_user_id', uid)
          .like('module', 'tab:%');
        const set = new Set<string>();
        (rows || []).forEach((r: any) => { if (r.can_view) set.add(r.module); });
        if (!cancelled) { setAllowed(set); setHasConfig((rows || []).length > 0); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tick]);

  return {
    loading,
    isSuperAdmin: isSuper,
    hasAnyConfig: hasConfig,
    // If no tab rows exist yet for this admin, allow everything
    // (backwards-compatible fallback until an admin sets access).
    allowMain: (k: string) => isSuper || !hasConfig || allowed.has(tabModule(k)),
    allowSub:  (p: string, s: string) => isSuper || !hasConfig || allowed.has(subTabModule(p, s)),
    refresh:   () => setTick(t => t + 1),
  };
}
