import { lazy, type ComponentType } from "react";

/**
 * A route component in its own chunk. `preload()` fetches the chunk ahead of
 * time; once it has resolved, the component renders synchronously instead of
 * suspending. main.tsx preloads the current route's page before the first
 * render, so a prerendered marketing page never flashes blank while its chunk
 * loads.
 */
export type LazyPage<P extends object> = ComponentType<P> & {
  preload: () => Promise<void>;
};

export function lazyPage<P extends object>(
  load: () => Promise<ComponentType<P>>,
): LazyPage<P> {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const fetchChunk = () => {
    pending ??= load().then((C) => (loaded = C));
    return pending;
  };
  const Lazy = lazy(() => fetchChunk().then((C) => ({ default: C })));
  const Page = ((props: P) => {
    const C = loaded;
    return C ? <C {...props} /> : <Lazy {...props} />;
  }) as LazyPage<P>;
  Page.preload = () => fetchChunk().then(() => undefined);
  return Page;
}
