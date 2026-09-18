// @ts-nocheck
/**
 * 🔄 AUTO VERSION CHECK & RELOAD SYSTEM
 * 
 * This utility automatically detects when a new version of the app is deployed
 * and forces a refresh to load the latest code. No user action needed!
 * 
 * How it works:
 * 1. Stores build timestamp in a version.json file
 * 2. Checks every 60 seconds if version changed
 * 3. Auto-reloads page with cache-busting when new version detected
 * 4. Works for ALL users automatically!
 */

const VERSION_CHECK_INTERVAL = 60000; // Check every 60 seconds
const VERSION_FILE = '/version.json';
const INITIAL_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : null;
const INITIAL_BUILD_TIME = typeof __APP_BUILD_TIME__ === 'string' ? __APP_BUILD_TIME__ : 'unknown';

let currentVersion: string | null = INITIAL_VERSION;
let checkInterval: number | null = null;

interface VersionInfo {
  version: string;
  buildTime: string;
  timestamp: number;
}

/**
 * Fetch the current version from version.json
 */
async function fetchVersion(): Promise<VersionInfo | null> {
  try {
    // Add cache-busting to ensure we get fresh version.json
    const response = await fetch(`${VERSION_FILE}?t=${Date.now()}`, {
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
    if (!response.ok) {
      // Silent - version.json doesn't exist yet (normal before first build)
      return null;
    }

    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      return null;
    }
    
    const versionInfo: VersionInfo = await response.json();
    return versionInfo;
  } catch (error) {
    // Silent - version check is optional, don't spam console
    return null;
  }
}

// Never auto-reload on auth pages or while the user is typing — a forced
// reload there wipes the credentials mid-entry and looks like "login twice".
const NO_RELOAD_PATHS = ['/login', '/register', '/reset-password'];

function userIsBusy(): boolean {
  try {
    if (NO_RELOAD_PATHS.some((p) => window.location.pathname.startsWith(p))) return true;
    const el = document.activeElement as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return true;
  } catch {}
  return false;
}

// Track which version we already reloaded for, so a stale-cached page can
// never trigger a reload loop.
const RELOADED_FOR_KEY = 'indexpilot-version-reloaded';

/**
 * Force reload the page with cache-busting
 */
function forceReload(targetVersion?: string) {
  if (userIsBusy()) {
    console.log('🔄 New version available, but user is busy - deferring reload');
    return false;
  }
  if (targetVersion && sessionStorage.getItem(RELOADED_FOR_KEY) === targetVersion) {
    console.log('⏸️ Already reloaded for this version - skipping to avoid a reload loop');
    return false;
  }
  console.log('🔄 NEW VERSION DETECTED! Reloading with fresh cache...');
  if (targetVersion) sessionStorage.setItem(RELOADED_FOR_KEY, targetVersion);

  // Clear all caches if available
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
  }

  // Hard reload with cache-busting
  window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
  return true;
}

let pendingVersion: string | null = null;
let reloadToastShown = false;

/**
 * Check if a new version is available
 */
async function checkForNewVersion(): Promise<boolean> {
  const newVersionInfo = await fetchVersion();

  if (!newVersionInfo) {
    return false;
  }

  // First time checking - store current version
  if (currentVersion === null) {
    currentVersion = newVersionInfo.version;
    console.log(`✅ Version check initialized: ${currentVersion} (built ${newVersionInfo.buildTime})`);
    return false;
  }

  // Check if version changed
  if (newVersionInfo.version !== currentVersion) {
    console.log(`🆕 NEW VERSION AVAILABLE!`);
    console.log(`   Current: ${currentVersion}`);
    console.log(`   New: ${newVersionInfo.version}`);
    console.log(`   Built: ${newVersionInfo.buildTime}`);
    pendingVersion = newVersionInfo.version;
    return true;
  }

  return false;
}

/**
 * Start periodic version checking
 */
export function startVersionCheck() {
  // Don't start if already running
  if (checkInterval !== null) {
    return;
  }
  
  console.log(`🔍 Version check service started (running ${currentVersion ?? 'unknown'} built ${INITIAL_BUILD_TIME})`);
  
  // Check immediately
  checkForNewVersion();
  
  // Then check periodically
  checkInterval = window.setInterval(async () => {
    const newVersionAvailable = await checkForNewVersion();

    if (newVersionAvailable) {
      // Show notification once (optional - can be removed if too intrusive)
      if (!reloadToastShown) {
        reloadToastShown = true;
        try {
          const toast = await import('sonner');
          toast.toast.info('New version available! It will refresh when you are not typing.', {
            duration: 3000
          });
        } catch (e) {
          // Toast not available, that's ok
        }
      }

      // Reload only when the user is NOT on an auth page or typing in a form.
      // If busy, keep checking and retry on the next interval instead of
      // interrupting the login flow.
      if (forceReload(pendingVersion ?? undefined)) {
        stopVersionCheck();
      }
    }
  }, VERSION_CHECK_INTERVAL);
}

/**
 * Stop version checking
 */
export function stopVersionCheck() {
  if (checkInterval !== null) {
    window.clearInterval(checkInterval);
    checkInterval = null;
    console.log('⏸️ Version check service stopped');
  }
}

/**
 * Manual version check (for testing)
 */
export async function manualVersionCheck() {
  console.log('🔍 Manual version check triggered...');
  const newVersionAvailable = await checkForNewVersion();
  
  if (newVersionAvailable) {
    const confirmed = window.confirm(
      'A new version is available! Click OK to reload and get the latest updates.'
    );
    
    if (confirmed) {
      forceReload();
    }
  } else {
    console.log('✅ You are running the latest version!');
    alert('You are running the latest version!');
  }
}