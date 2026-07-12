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
        if (!uid) { if (!cancelled) { setAllowed(new Set()); setIsSuper(false); setHasConfig(false); setLoading(false); } return; }

        const url_key =
          sessionStorage.getItem('admin_unique_code') ||
          (window.location.pathname.match(/\/admin\/hotkey\/([^/]+)/)?.[1] ?? '');

        const token = sessionStorage.getItem('admin_access_token') || undefined;
        const { data, error } = await supabase.functions.invoke('admin-security-manage', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: { action: 'get_tab_access', user_id: uid, url_key, admin_code: url_key },
        });
        if (error) {
          console.warn('useAllowedTabs: get_tab_access failed', error.message);
        }
        if (cancelled) return;
        setIsSuper(!!data?.is_super_admin);
        setHasConfig(!!data?.has_config);
        setAllowed(new Set<string>((data?.allowed as string[]) || []));
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
