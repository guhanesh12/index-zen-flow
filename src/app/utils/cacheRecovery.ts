// @ts-nocheck

const CACHE_RECOVERY_VERSION_KEY = 'indexpilot-cache-recovery-version';
const CACHE_RECOVERY_RELOAD_KEY = 'indexpilot-cache-recovery-reload';

async function clearBrowserCaches(): Promise<boolean> {
  if (!('caches' in window)) {
    return false;
  }

  const cacheNames = await caches.keys();

  if (cacheNames.length === 0) {
    return false;
  }

  await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
  return true;
}

async function unregisterServiceWorkers(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();

  if (registrations.length === 0) {
    return false;
  }

  await Promise.all(registrations.map((registration) => registration.unregister()));
  return true;
}

async function registerCleanupWorker(version: string) {
  // Do not re-register a service worker here. Re-registering after cleanup made
  // the production domain reload again on the next visit and caused double-load
  // / stale admin-screen issues on custom domains.
  return;
}

export async function startCacheRecovery() {
  if (typeof window === 'undefined') {
    return;
  }

  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';
  const previousVersion = localStorage.getItem(CACHE_RECOVERY_VERSION_KEY);
  const alreadyReloadedForVersion = sessionStorage.getItem(CACHE_RECOVERY_RELOAD_KEY) === version;

  const [hadCaches, hadServiceWorkers] = await Promise.all([
    clearBrowserCaches(),
    unregisterServiceWorkers(),
  ]);

  await registerCleanupWorker(version);

  if (previousVersion !== version) {
    localStorage.setItem(CACHE_RECOVERY_VERSION_KEY, version);
    sessionStorage.removeItem(CACHE_RECOVERY_RELOAD_KEY);
  }

  if (false && (hadCaches || hadServiceWorkers) && !alreadyReloadedForVersion) {
    sessionStorage.setItem(CACHE_RECOVERY_RELOAD_KEY, version);
    const url = new URL(window.location.href);
    url.searchParams.set('v', version);
    window.location.replace(url.toString());
  }
}