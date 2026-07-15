// Cross-environment drift: which keys a project's env files share and which
// ones are missing from some. All comparison is on decrypted text in the
// browser — the server never sees keys — using the same line parser as the
// table editor, so "key" means exactly what an edit means. Values are never
// compared or surfaced here; presence is the whole story.

import { parseEnvText } from "./env-table.ts";

export interface DriftFile {
  /** Stable id (the file id) so the UI can map a column back to a file. */
  id: string;
  /** Column heading — the environment label, or the filename as a fallback. */
  label: string;
  text: string;
}

export interface DriftColumn {
  id: string;
  label: string;
}

export interface DriftRow {
  key: string;
  /** Presence per column, in `columns` order. */
  present: boolean[];
}

export interface DriftReport {
  columns: DriftColumn[];
  /** Every key across all files, sorted, with per-column presence. */
  rows: DriftRow[];
  /** Rows missing from at least one column — the actual drift. */
  drifted: DriftRow[];
  /** Total (key, column) gaps across the drifted rows. */
  gaps: number;
}

/** Unique entry keys in a file, in first-seen order (duplicates collapse). */
export function keysOf(text: string): string[] {
  const seen = new Set<string>();
  for (const line of parseEnvText(text)) {
    if (line.kind === "entry") seen.add(line.key);
  }
  return [...seen];
}

/**
 * Compare env files by key presence. Needs at least two files to show drift;
 * with fewer, `drifted` is empty. Keys are unioned and sorted so the matrix is
 * stable regardless of file order.
 */
export function compareEnvs(files: DriftFile[]): DriftReport {
  const columns: DriftColumn[] = files.map((f) => ({ id: f.id, label: f.label }));
  const keySets = files.map((f) => new Set(keysOf(f.text)));

  const allKeys = [...new Set(files.flatMap((f) => keysOf(f.text)))].sort(
    (a, b) => a.localeCompare(b),
  );

  const rows: DriftRow[] = allKeys.map((key) => ({
    key,
    present: keySets.map((set) => set.has(key)),
  }));

  const drifted = rows.filter((r) => r.present.some((p) => !p));
  const gaps = drifted.reduce(
    (n, r) => n + r.present.filter((p) => !p).length,
    0,
  );

  return { columns, rows, drifted, gaps };
}
