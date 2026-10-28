// The shape of the vault as this device last drew it, so the loading skeleton
// can draw the same shape before the tree arrives: how many projects, how many
// files each, which are expanded in the sidebar, and whether a file was open.
// Counts and flags only, never a name or an id. UI sugar: per device, and
// everything falls back to a generic shape when storage is unavailable.

const KEY = "klef.layout-hint";
// A skeleton past a screenful says nothing more; keep the stored value small.
const MAX_PROJECTS = 12;
const MAX_FILES = 12;
const MAX_TABS = 8;

export interface LayoutHint {
  /** File count per project, in sidebar order. */
  files: number[];
  /** Whether each project is expanded in the sidebar, same order. */
  expanded: boolean[];
  /** Open file tabs (0 for none). */
  tabs: number;
  /** A file was in view rather than the overview. */
  fileOpen: boolean;
}

/** What a first visit (or unreadable storage) gets: a small, plausible vault. */
export const DEFAULT_LAYOUT_HINT: LayoutHint = {
  files: [3, 2, 2],
  expanded: [false, false, false],
  tabs: 0,
  fileOpen: false,
};

const count = (n: unknown, max: number) =>
  typeof n === "number" && Number.isFinite(n)
    ? Math.min(max, Math.max(0, Math.floor(n)))
    : 0;

/** Validate whatever storage held; anything malformed is the default. */
export function parseLayoutHint(raw: string | null): LayoutHint {
  if (!raw) return DEFAULT_LAYOUT_HINT;
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof LayoutHint, unknown>>;
    if (!Array.isArray(v.files)) return DEFAULT_LAYOUT_HINT;
    const files = v.files.slice(0, MAX_PROJECTS).map((n) => count(n, MAX_FILES));
    const expanded = files.map(
      (_, i) => Array.isArray(v.expanded) && v.expanded[i] === true,
    );
    const tabs = count(v.tabs, MAX_TABS);
    return { files, expanded, tabs, fileOpen: tabs > 0 && v.fileOpen === true };
  } catch {
    return DEFAULT_LAYOUT_HINT;
  }
}

export function readLayoutHint(): LayoutHint {
  try {
    return parseLayoutHint(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_LAYOUT_HINT;
  }
}

/**
 * Merge `part` into the stored hint. The sidebar owns the tree half and the
 * file area the tabs half, so each writes only what it knows.
 */
export function rememberLayout(part: Partial<LayoutHint>): void {
  try {
    const next = { ...readLayoutHint(), ...part };
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or blocked storage: the generic shape will do.
  }
}

/** The tree half of a hint, from the projects as drawn. */
export function treeHint(
  projects: readonly { id: string; files: readonly unknown[] }[],
  expanded: ReadonlySet<string>,
): Pick<LayoutHint, "files" | "expanded"> {
  const shown = projects.slice(0, MAX_PROJECTS);
  return {
    files: shown.map((p) => Math.min(MAX_FILES, p.files.length)),
    expanded: shown.map((p) => expanded.has(p.id)),
  };
}
