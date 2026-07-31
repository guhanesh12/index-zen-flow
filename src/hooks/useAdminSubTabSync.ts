import { useEffect } from 'react';

export const ADMIN_SUBTAB_EVENT = 'admin-subtab-select';

/** Emit a sub-tab selection from the admin vertical nav. */
export function selectAdminSubTab(parent: string, sub: string) {
  window.dispatchEvent(new CustomEvent(ADMIN_SUBTAB_EVENT, { detail: { parent, sub } }));
}

/**
 * Listen for sub-tab selections coming from the admin vertical nav.
 * `parent` is the main tab key this component renders (e.g. 'settings').
 */
export function useAdminSubTabSync(parent: string, onSelect: (sub: string) => void) {
  useEffect(() => {
    const handler = (e: any) => {
      if (e?.detail?.parent === parent && e?.detail?.sub) onSelect(e.detail.sub);
    };
    window.addEventListener(ADMIN_SUBTAB_EVENT, handler as EventListener);
    return () => window.removeEventListener(ADMIN_SUBTAB_EVENT, handler as EventListener);
  }, [parent, onSelect]);
}
