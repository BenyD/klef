// Per-device recency for file opens, so overview cards can surface the two
// files you actually work with. UI sugar only: ids in localStorage, never
// synced, and everything degrades to file order when storage is unavailable.

const KEY = "klef.recent-files";
const CAP = 50;

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Move a file to the front of the recency list (called on open). */
export function recordRecentFile(id: string): void {
  try {
    const next = [id, ...read().filter((x) => x !== id)].slice(0, CAP);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or blocked storage: recency is a nicety, skip.
  }
}

export function getRecentFileIds(): string[] {
  return read();
}

/** Most recently opened first; untouched files keep their given order. */
export function sortByRecency<T extends { id: string }>(
  files: T[],
  recentIds: string[],
): T[] {
  const rank = new Map(recentIds.map((id, i) => [id, i]));
  return [...files].sort(
    (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
  );
}
