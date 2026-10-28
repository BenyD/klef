// Open-file tab state, headless: the editor's tab strip calls these and
// renders the result. Pure functions over an ordered list of tabs plus the
// active id, so every rule (where focus goes on close, what Alt+9 means,
// when a tab needs its project shown) is tested without a DOM.
//
// Tabs stay grouped by project: a project's tabs sit side by side, groups in
// the order their project was first opened, so the strip can label and
// collapse each project's run.

export interface Tab {
  id: string;
  name: string;
  /** Groups tabs; names can repeat across projects, ids can't. */
  projectId: string;
  project: string;
}

export interface TabGroup<T extends Tab> {
  projectId: string;
  project: string;
  tabs: T[];
}

/**
 * Reorders so each project's tabs are contiguous, groups in order of their
 * first tab, tabs within a group in their existing order.
 */
export function groupByProject<T extends Tab>(tabs: readonly T[]): T[] {
  return tabGroups(tabs).flatMap((g) => g.tabs);
}

/** The strip's project runs, in order. */
export function tabGroups<T extends Tab>(tabs: readonly T[]): TabGroup<T>[] {
  const groups = new Map<string, TabGroup<T>>();
  for (const t of tabs) {
    const group = groups.get(t.projectId);
    if (group) group.tabs.push(t);
    else {
      groups.set(t.projectId, {
        projectId: t.projectId,
        project: t.project,
        tabs: [t],
      });
    }
  }
  return [...groups.values()];
}

export interface TabState<T extends Tab> {
  tabs: T[];
  /** The tab in view; null shows the overview with the tabs kept open. */
  activeId: string | null;
}

/**
 * Open a tab and make it active: focused if already open, else placed after
 * its project's last tab (a new project's tab goes at the end).
 */
export function openTab<T extends Tab>(
  state: TabState<T>,
  tab: T,
): TabState<T> {
  if (state.tabs.some((t) => t.id === tab.id)) {
    return { tabs: state.tabs, activeId: tab.id };
  }
  const last = state.tabs.findLastIndex((t) => t.projectId === tab.projectId);
  const at = last === -1 ? state.tabs.length : last + 1;
  const tabs = [...state.tabs.slice(0, at), tab, ...state.tabs.slice(at)];
  return { tabs, activeId: tab.id };
}

/**
 * Close tabs. If the active one goes, focus moves to the tab that took its
 * place (the one to its right), else the new last tab, like every editor;
 * closing the last tab leaves nothing active.
 */
export function closeTabs<T extends Tab>(
  state: TabState<T>,
  ids: Iterable<string>,
): TabState<T> {
  const closing = new Set(ids);
  const tabs = state.tabs.filter((t) => !closing.has(t.id));
  if (state.activeId === null || !closing.has(state.activeId)) {
    return { tabs, activeId: state.activeId };
  }
  const from = state.tabs.findIndex((t) => t.id === state.activeId);
  // The first surviving tab at or after the old position, else before it.
  const after = state.tabs.slice(from + 1).find((t) => !closing.has(t.id));
  const before = state.tabs
    .slice(0, from)
    .reverse()
    .find((t) => !closing.has(t.id));
  return { tabs, activeId: (after ?? before)?.id ?? null };
}

/** Every tab except `id`. */
export function othersOf<T extends Tab>(tabs: readonly T[], id: string): string[] {
  return tabs.filter((t) => t.id !== id).map((t) => t.id);
}

/** The tabs to the right of `id`. */
export function rightOf<T extends Tab>(tabs: readonly T[], id: string): string[] {
  const i = tabs.findIndex((t) => t.id === id);
  return i === -1 ? [] : tabs.slice(i + 1).map((t) => t.id);
}

/**
 * Move the tab at `from` to index `to` (drag to reorder). Groups hold: a tab
 * dropped among another project's tabs lands back in its own group, and
 * dragging a project's tab ahead of every other group moves the group.
 */
export function moveTab<T extends Tab>(tabs: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= tabs.length) return [...tabs];
  const next = [...tabs];
  const [tab] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, tab as T);
  return groupByProject(next);
}

/**
 * The tab `step` places from the active one, wrapping around. With nothing
 * active, forward starts at the first tab and backward at the last.
 */
export function cycleTab<T extends Tab>(
  state: TabState<T>,
  step: 1 | -1,
): string | null {
  const n = state.tabs.length;
  if (n === 0) return null;
  const i = state.tabs.findIndex((t) => t.id === state.activeId);
  if (i === -1) return (step === 1 ? state.tabs[0] : state.tabs[n - 1])!.id;
  return state.tabs[(i + step + n) % n]!.id;
}

/** Alt+1..8 picks that tab; Alt+9 is always the last (the browser rule). */
export function tabForDigit<T extends Tab>(
  tabs: readonly T[],
  digit: number,
): string | null {
  if (digit < 1 || digit > 9 || tabs.length === 0) return null;
  if (digit === 9) return tabs[tabs.length - 1]!.id;
  return tabs[digit - 1]?.id ?? null;
}

/** What survives a reload: ids only, per workspace. Names come from the tree. */
export interface SavedTabs {
  ids: string[];
  activeId: string | null;
}

export function serializeTabs<T extends Tab>(state: TabState<T>): string {
  const saved: SavedTabs = {
    ids: state.tabs.map((t) => t.id),
    activeId: state.activeId,
  };
  return JSON.stringify(saved);
}

/**
 * Rebuilds saved tabs against the files that still exist (`resolve` returns
 * null for a deleted one). Anything malformed restores nothing.
 */
export function restoreTabs<T extends Tab>(
  raw: string | null,
  resolve: (id: string) => T | null,
): TabState<T> {
  const empty: TabState<T> = { tabs: [], activeId: null };
  if (!raw) return empty;
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (
    typeof saved !== "object" ||
    saved === null ||
    !Array.isArray((saved as SavedTabs).ids)
  ) {
    return empty;
  }
  const { ids, activeId } = saved as SavedTabs;
  const tabs = ids
    .filter((id): id is string => typeof id === "string")
    .map(resolve)
    .filter((t): t is T => t !== null);
  const active =
    typeof activeId === "string" && tabs.some((t) => t.id === activeId)
      ? activeId
      : null;
  return { tabs: groupByProject(tabs), activeId: active };
}
