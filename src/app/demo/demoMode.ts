// @ts-nocheck
/**
 * Demo mode — used only for producing the product demo video.
 *
 * Activated with `?demo=1`. It signs in a fake "Demo User", answers every API
 * call from an in-browser fake dataset and short-circuits broker connection,
 * payments and order placement. Normal visitors never touch this code path.
 */
import { handleDemoRequest, demoSession, DEMO_ACCESS_TOKEN } from './demoApi';
import { DEMO_SIGNALS } from './demoData';
import { projectId } from '@/utils-ext/supabase/info';

const FLAG = 'indexpilot_demo_mode';
const AUTH_KEY = `sb-${projectId}-auth-token`;
const BACKUP_KEY = 'indexpilot_real_auth_backup';

/** Put back the visitor's genuine login and remove every demo artefact. */
export function exitDemoMode() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(FLAG);
    const backup = localStorage.getItem(BACKUP_KEY);
    if (backup !== null) {
      localStorage.setItem(AUTH_KEY, backup);
      localStorage.removeItem(BACKUP_KEY);
    } else {
      // Only clear the demo token we wrote ourselves.
      const cur = localStorage.getItem(AUTH_KEY);
      if (cur && cur.includes(DEMO_ACCESS_TOKEN)) localStorage.removeItem(AUTH_KEY);
    }
    localStorage.removeItem('demo_access_token');
    document.documentElement.removeAttribute('data-demo');
  } catch { /* ignore */ }
}

export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('demo');
    if (flag === '0') {
      exitDemoMode();
      return false;
    }
    if (flag === '1') {
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
    // Never destroy a genuine login: keep it aside so it can be restored.
    const existing = localStorage.getItem(AUTH_KEY);
    if (existing && !existing.includes(DEMO_ACCESS_TOKEN) && localStorage.getItem(BACKUP_KEY) === null) {
      localStorage.setItem(BACKUP_KEY, existing);
    }
    localStorage.setItem(AUTH_KEY, JSON.stringify(payload));
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
  if (!isDemoMode()) {
    // A previous demo tab may have left a fake session behind: clean it up.
    exitDemoMode();
    return;
  }
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

  seedEngineBridge();

  // Keep the demo flag on every in-app navigation so a reload stays in demo mode.
  document.documentElement.setAttribute('data-demo', 'true');
  console.info('🎬 Demo mode active — all data on screen is sample data.');
}

/**
 * The terminal reads engine state and published signals from localStorage.
 * In demo mode we publish the sample signals ourselves and let the
 * Start / Stop engine buttons flip the same state, so the recording can show
 * the engine being started and signals arriving.
 */
function seedEngineBridge() {
  const state = { running: false, interval: '15' as '5' | '15' };

  const write = () => {
    const signals = state.running
      ? {
          NIFTY: DEMO_SIGNALS[0],
          BANKNIFTY: DEMO_SIGNALS[1],
          SENSEX: DEMO_SIGNALS[2],
        }
      : {};
    try {
      localStorage.setItem('engine_signals', JSON.stringify(signals));
      localStorage.setItem('engine_signals_time', String(Date.now()));
      localStorage.setItem('engine_running', state.running ? 'true' : 'false');
      localStorage.setItem('engine_interval', state.interval);
      localStorage.setItem(
        'engine_bridge',
        JSON.stringify({
          running: state.running,
          interval: state.interval,
          slotsReady: 3,
          activeCount: state.running ? 2 : 0,
          marketStatus: 'OPEN',
          nextCandleClose: nextCandleLabel(state.interval),
          stats: {
            totalSignals: state.running ? 3 : 0,
            totalOrders: state.running ? 2 : 0,
            avgExecutionTime: state.running ? 214 : 0,
          },
        })
      );
    } catch { /* ignore */ }
  };

  write();
  setInterval(write, 1000);

  window.addEventListener('terminal-engine-start', () => { state.running = true; write(); });
  window.addEventListener('terminal-engine-stop', () => { state.running = false; write(); });
  window.addEventListener('terminal-engine-interval', (e: any) => {
    state.interval = e?.detail === '5' ? '5' : '15';
    write();
  });
}

function nextCandleLabel(interval: '5' | '15') {
  const step = interval === '5' ? 5 : 15;
  const d = new Date();
  d.setMinutes(Math.ceil((d.getMinutes() + 0.001) / step) * step, 0, 0);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}
