import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TAB_TREE, tabModule, subTabModule } from '@/app/adminTabs';

const PERMANENT_SUPER_ADMIN_EMAIL = 'airoboengin@smilykart.com';

const allTabModules = () => {
  const modules: string[] = [];
  TAB_TREE.forEach((tab) => {
    modules.push(tabModule(tab.key));
    tab.subs.forEach((sub) => modules.push(subTabModule(tab.key, sub.key)));
  });
  return modules;
};

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
 *
 * Reads go through the admin-security-manage edge function (service role) so
 * that hotkey-based admin sessions — which store their token in sessionStorage
 * but never call supabase.auth.setSession — can still see their own permissions.
 * A direct RLS-scoped read would return zero rows for those sessions and cause
 * the fallback to (incorrectly) show every tab.
 */
export function useAllowedTabs(): AllowedTabs {
  const [loading, setLoading]     = useState(true);
  const [isSuper, setIsSuper]     = useState(false);
  const [allowed, setAllowed]     = useState<Set<string>>(new Set());
  const [subConfiguredParents, setSubConfiguredParents] = useState<Set<string>>(new Set());
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
        let email: string | null = null;
        try {
          const raw = sessionStorage.getItem('admin_user');
          if (raw) {
            const j = JSON.parse(raw);
            uid = j?.user_id || j?.id || null;
            email = String(j?.email || '').trim().toLowerCase() || null;
          }
        } catch { /* ignore */ }
        if (!uid) {
          const { data } = await supabase.auth.getUser();
          uid = data.user?.id || null;
          email = String(data.user?.email || '').trim().toLowerCase() || email;
        }
        if (!uid) { if (!cancelled) { setAllowed(new Set()); setSubConfiguredParents(new Set()); setIsSuper(false); setHasConfig(false); setLoading(false); } return; }

        // The platform owner must never be restricted by stale/missing rows.
        if (email === PERMANENT_SUPER_ADMIN_EMAIL) {
          if (!cancelled) {
            setIsSuper(true);
            setHasConfig(true);
            setAllowed(new Set(allTabModules()));
            setSubConfiguredParents(new Set(TAB_TREE.map((tab) => tab.key)));
            setLoading(false);
          }
          return;
        }

        const url_key =
          sessionStorage.getItem('admin_unique_code') ||
          (window.location.pathname.match(/\/admin\/hotkey\/([^/]+)/)?.[1] ?? '');

        const token = sessionStorage.getItem('admin_access_token') || undefined;
        const { data, error } = await supabase.functions.invoke('admin-security-manage', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: { action: 'get_tab_access', user_id: uid, email, url_key, admin_code: url_key },
        });
        if (error) {
          console.warn('useAllowedTabs: get_tab_access failed', error.message);
        }
        if (cancelled) return;
        const superAdmin = !!data?.is_super_admin;
        setIsSuper(superAdmin);
        setHasConfig(!!data?.has_config);
        setAllowed(new Set<string>(superAdmin ? allTabModules() : ((data?.allowed as string[]) || [])));
        setSubConfiguredParents(new Set<string>(superAdmin ? TAB_TREE.map((tab) => tab.key) : ((data?.sub_configured_parents as string[]) || [])));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tick]);

  // Refresh when another part of the app saves new tab permissions
  // (e.g. AdminUserManagement → Save Changes). Avoids a full page reload
  // to see the newly-restricted tab set take effect.
  useEffect(() => {
    const onUpdate = () => setTick(t => t + 1);
    window.addEventListener('admin-tabs-updated', onUpdate);
    return () => window.removeEventListener('admin-tabs-updated', onUpdate);
  }, []);

  return {
    loading,
    isSuperAdmin: isSuper,
    hasAnyConfig: hasConfig,
    // Non-super admins see only explicitly assigned tabs. No config = no tabs.
    allowMain: (k: string) => isSuper || allowed.has(tabModule(k)),
    allowSub:  (p: string, s: string) => isSuper || allowed.has(subTabModule(p, s)) || (!subConfiguredParents.has(p) && allowed.has(tabModule(p))),
    refresh:   () => setTick(t => t + 1),
  };
}
