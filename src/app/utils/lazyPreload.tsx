import { lazy, type ComponentType } from 'react';

export type PreloadableComponent<T extends ComponentType<any>> = React.LazyExoticComponent<T> & {
  preload: () => Promise<{ default: T }>;
};

/**
 * React.lazy + a `preload()` with robust exponential auto-retry,
 * dynamic import recovery, and stale chunk cache-busting.
 */
export function lazyWithPreload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): PreloadableComponent<T> {
  let promise: Promise<{ default: T }> | null = null;

  const loadWithRetry = async (retries = 5, delay = 400): Promise<{ default: T }> => {
    try {
      return await factory();
    } catch (err: any) {
      const isChunkError = 
        err?.message?.includes('Failed to fetch dynamically imported module') ||
        err?.message?.includes('Importing a module script failed') ||
        err?.message?.includes('error loading dynamically imported module') ||
        err?.name === 'ChunkLoadError' ||
        err?.name === 'TypeError';

      if (retries > 0) {
        console.warn(`⚠️ Dynamic import attempt failed (${retries} retries left), retrying in ${delay}ms...`, err?.message || err);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return loadWithRetry(retries - 1, Math.min(delay * 1.5, 3000));
      }

      // If all retries failed and it's a stale chunk/network error, refresh the page to load fresh assets
      if (typeof window !== 'undefined' && isChunkError) {
        const lastReload = parseInt(sessionStorage.getItem('last_chunk_reload') || '0', 10);
        const now = Date.now();
        if (now - lastReload > 5000) {
          sessionStorage.setItem('last_chunk_reload', String(now));
          console.warn('🔄 Dev-server restart or chunk update detected. Refreshing page for latest assets...');
          window.location.reload();
          return new Promise(() => {}); // never resolves because reload is in progress
        }
      }

      promise = null;
      console.error('❌ Failed to dynamically import component after retries:', err);
      throw err;
    }
  };

  const load = (): Promise<{ default: T }> => {
    if (!promise) {
      promise = loadWithRetry().catch((err) => {
        promise = null;
        throw err;
      });
    }
    return promise;
  };

  const Component = lazy(load) as PreloadableComponent<T>;
  Component.preload = load;
  return Component;
}

/** Run a preload when the browser is idle (never blocks first paint). */
export function preloadOnIdle(...loaders: Array<() => Promise<unknown>>) {
  if (typeof window === 'undefined') return;
  const run = () => loaders.forEach((l) => { try { l(); } catch { /* ignore */ } });
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;
  if (ric) ric(run, { timeout: 2000 });
  else setTimeout(run, 300);
}

