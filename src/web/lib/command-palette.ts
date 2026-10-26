// Command palette plumbing: the global open shortcut, outside the component
// so it can be unit-tested. Matching and ranking live in palette-search.ts.

import { useEffect } from "react";

/**
 * Global Cmd/Ctrl+K → toggle the palette. Requires a bare chord (no
 * Shift/Alt) so it can't shadow other modifier combos — the lock shortcut
 * (Cmd/Ctrl+Shift+L) keeps working with the palette mounted alongside.
 */
export function usePaletteShortcut(toggle: () => void): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "k"
      ) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);
}
