import { lazy, type ComponentType } from 'react';

export type PreloadableComponent<T extends ComponentType<any>> = React.LazyExoticComponent<T> & {
  preload: () => Promise<{ default: T }>;
};

/**
 * React.lazy + a `preload()` you can call ahead of time (on idle, hover, focus)
 * so the chunk is already in memory when the user actually navigates.
 */
export function lazyWithPreload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): PreloadableComponent<T> {
  let promise: Promise<{ default: T }> | null = null;
  const load = () => {
    if (!promise) promise = factory();
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
