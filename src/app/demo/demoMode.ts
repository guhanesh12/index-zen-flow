// @ts-nocheck
/**
 * Demo mode — used only for producing the product demo video.
 *
 * Activated with `?demo=1`. It signs in a fake "Demo User", answers every API
 * call from an in-browser fake dataset and short-circuits broker connection,
 * payments and order placement. Normal visitors never touch this code path.
 */
import { handleDemoRequest, demoSession, DEMO_ACCESS_TOKEN } from './demoApi';
import { projectId } from '@/utils-ext/supabase/info';

const FLAG = 'indexpilot_demo_mode';

export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1') {
      sessionStorage.setItem(FLAG, '1');
      return true;
    }
    return sessionStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

/** Write a fake Supabase session so protected routes render without a real login. */
function seedDemoSession() {
  const session = demoSession();
  const payload = {
    ...session,
    expires_at: session.expires_at,
  };
  try {
    localStorage.setItem(`sb-${projectId}-auth-token`, JSON.stringify(payload));
    localStorage.setItem('demo_access_token', DEMO_ACCESS_TOKEN);
  } catch { /* ignore */ }
}

function shouldIntercept(url: string): boolean {
  try {
    const u = new URL(url, window.location.origin);
    if (u.hostname.endsWith('supabase.co')) return true;
    if (u.pathname.includes('/functions/v1/')) return true;
    if (u.pathname.startsWith('/rest/v1/') || u.pathname.startsWith('/auth/v1/')) return true;
    if (u.pathname.startsWith('/api/')) return true;
    if (/(razorpay|cashfree|dhan\.co|angelbroking|upstox|fyers)/i.test(u.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

export function installDemoMode() {
  if (!isDemoMode()) return;
  seedDemoSession();

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: any, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    const method = init?.method || (typeof input === 'object' ? input?.method : 'GET');
    if (shouldIntercept(url)) {
      let body = init?.body;
      if (!body && typeof input === 'object' && typeof input.clone === 'function') {
        try { body = await input.clone().text(); } catch { /* ignore */ }
      }
      const res = handleDemoRequest(url, { ...init, method, body });
      if (res) return res;
    }
    return nativeFetch(input, init);
  };

  // Keep the demo flag on every in-app navigation so a reload stays in demo mode.
  document.documentElement.setAttribute('data-demo', 'true');
  console.info('🎬 Demo mode active — all data on screen is sample data.');
}
