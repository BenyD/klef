// Command palette plumbing: the global open shortcut and the match scoring
// for the list. Both live outside the component so they can be unit-tested.

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

/**
 * Ranks a palette item for a query (cmdk's `filter` signature). Every
 * whitespace-separated token must match the item's value or one of its
 * keywords, so "api prod" narrows to production files in the api project.
 * Value matches outrank keyword matches, prefixes outrank substrings.
 */
export function paletteFilter(
  value: string,
  search: string,
  keywords?: string[],
): number {
  const tokens = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 1;
  const v = value.toLowerCase();
  const ks = keywords?.map((k) => k.toLowerCase()) ?? [];
  let total = 0;
  for (const token of tokens) {
    const score = v.startsWith(token)
      ? 1
      : v.includes(token)
        ? 0.8
        : ks.some((k) => k.includes(token))
          ? 0.5
          : 0;
    if (score === 0) return 0;
    total += score;
  }
  return total / tokens.length;
}
