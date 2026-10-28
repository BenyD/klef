import { useEffect, useRef, useState } from "react";

/** A wait shorter than this never shows a loader at all. */
export const LOADER_DELAY_MS = 200;
/** Once a loader is up, it stays at least this long, so it never blinks. */
export const LOADER_MIN_MS = 500;

/**
 * Whether a loader for `active` should be on screen. It appears only once the
 * wait has lasted `delayMs` (a fast load shows nothing, not a flash) and, once
 * shown, stays for at least `minMs` even if the wait ends sooner (a slow load
 * never ends in a blink). For spinners and other indeterminate indicators;
 * a skeleton that matches its content can show at once instead.
 */
export function useDelayedLoading(
  active: boolean,
  { delayMs = LOADER_DELAY_MS, minMs = LOADER_MIN_MS } = {},
): boolean {
  const [shown, setShown] = useState(false);
  // When the loader appeared; null while hidden.
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      if (shownAt.current !== null) return;
      const id = window.setTimeout(() => {
        shownAt.current = Date.now();
        setShown(true);
      }, delayMs);
      return () => window.clearTimeout(id);
    }
    if (shownAt.current === null) return;
    const left = minMs - (Date.now() - shownAt.current);
    const hide = () => {
      shownAt.current = null;
      setShown(false);
    };
    if (left <= 0) {
      hide();
      return;
    }
    const id = window.setTimeout(hide, left);
    return () => window.clearTimeout(id);
  }, [active, delayMs, minMs]);

  return shown;
}
