// Cross-environment drift: which keys a project's env files share, which are
// missing from some, and where values disagree. All comparison is on decrypted
// text in the browser — the server never sees keys or values — using the same
// line parser as the table editor, so "key" means exactly what an edit means.

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
  /** Value per column, in `columns` order; null where the key is absent. */
  values: (string | null)[];
  /** True when at least two columns have the key with different values. */
  changed: boolean;
}

export interface DriftReport {
  columns: DriftColumn[];
  /** Every key across all files, sorted, with per-column presence. */
  rows: DriftRow[];
  /** Rows missing from at least one column — the actual drift. */
  drifted: DriftRow[];
  /** Total (key, column) gaps across the drifted rows. */
  gaps: number;
  /** Rows where columns disagree on the value. */
  changed: DriftRow[];
  /** Rows that differ at all: missing from a column or changed between them. */
  diff: DriftRow[];
}

/** Unique entry keys in a file, in first-seen order (duplicates collapse). */
export function keysOf(text: string): string[] {
  const seen = new Set<string>();
  for (const line of parseEnvText(text)) {
    if (line.kind === "entry") seen.add(line.key);
  }
  return [...seen];
}

/** Entry values by key; duplicates resolve to the last occurrence, matching dotenv loaders. */
export function valuesOf(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of parseEnvText(text)) {
    if (line.kind === "entry") values.set(line.key, line.value);
  }
  return values;
}

/**
 * Compare env files by key presence and value. Needs at least two files to
 * show drift; with fewer, `drifted` and `diff` are empty. Keys are unioned and
 * sorted so the matrix is stable regardless of file order.
 */
export function compareEnvs(files: DriftFile[]): DriftReport {
  const columns: DriftColumn[] = files.map((f) => ({ id: f.id, label: f.label }));
  const valueMaps = files.map((f) => valuesOf(f.text));

  const allKeys = [...new Set(files.flatMap((f) => keysOf(f.text)))].sort(
    (a, b) => a.localeCompare(b),
  );

  const rows: DriftRow[] = allKeys.map((key) => {
    const values = valueMaps.map((m) => m.get(key) ?? null);
    const held = values.filter((v): v is string => v !== null);
    return {
      key,
      present: values.map((v) => v !== null),
      values,
      changed: new Set(held).size > 1,
    };
  });

  const drifted = rows.filter((r) => r.present.some((p) => !p));
  const gaps = drifted.reduce(
    (n, r) => n + r.present.filter((p) => !p).length,
    0,
  );
  const changed = rows.filter((r) => r.changed);
  const diff = rows.filter((r) => r.changed || r.present.some((p) => !p));

  return { columns, rows, drifted, gaps, changed, diff };
}
