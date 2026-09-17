// @ts-nocheck
/**
 * 🔒 PRODUCTION SECURITY GUARD
 * - Silences all console output in production
 * - Blocks right-click, devtools shortcuts, view-source shortcuts
 * - Detects open DevTools and clears console
 * - Disables text selection on sensitive areas (optional via class .no-select)
 *
 * Active ONLY on production hosts. Localhost / lovable preview keep full logs.
 */

const PROD_HOSTS = [
  'indexpilotai.com',
  'www.indexpilotai.com',
];

function isProdHost(): boolean {
  try {
    const h = window.location.hostname;
    return PROD_HOSTS.includes(h);
  } catch {
    return false;
  }
}

function silenceConsole() {
  const noop = () => {};
  const methods = [
    'log', 'info', 'warn', 'error', 'debug', 'trace',
    'table', 'dir', 'group', 'groupCollapsed', 'groupEnd',
    'time', 'timeEnd', 'timeLog', 'count', 'countReset',
    'assert', 'profile', 'profileEnd',
  ];
  try {
    for (const m of methods) {
      try { (console as any)[m] = noop; } catch { /* ignore */ }
    }
    // Periodically clear in case anything slipped through
    setInterval(() => { try { console.clear(); } catch {} }, 2000);
  } catch { /* ignore */ }
}

function blockDevtoolShortcuts() {
  // Right-click context menu
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
  }, { capture: true });

  // F12, Ctrl+Shift+I/J/C, Ctrl+U (view source), Ctrl+S (save)
  window.addEventListener('keydown', (e) => {
    const key = (e.key || '').toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    if (
      key === 'f12' ||
      (ctrl && shift && (key === 'i' || key === 'j' || key === 'c')) ||
      (ctrl && (key === 'u' || key === 's'))
    ) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, { capture: true });
}

function detectDevtoolsOpen() {
  // Heuristic: large window/inner size delta indicates devtools panel
  const threshold = 160;
  const check = () => {
    try {
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      if (widthDiff > threshold || heightDiff > threshold) {
        try { console.clear(); } catch {}
      }
    } catch {}
  };
  setInterval(check, 1500);
}

export function initProductionGuard() {
  if (!isProdHost()) return;
  silenceConsole();
  blockDevtoolShortcuts();
  detectDevtoolsOpen();
}
