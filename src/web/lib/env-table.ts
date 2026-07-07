// Line-level parsing and surgical edits for env text, backing the KV table
// editor. The crypto contract stores the raw pasted text byte-for-byte (see
// src/shared/BLOB_FORMAT.md), so the table editor must never re-serialize the
// whole file: every mutation rewrites exactly one line and leaves every other
// byte untouched. Comments, blank lines, indentation, `export ` prefixes, and
// spacing around `=` all survive edits verbatim.
//
// Deliberately line-based: a multi-line quoted value parses as one entry line
// (the opening line) plus "other" continuation lines. Inline comments after a
// value are part of the value text. Both are honest trade-offs that keep the
// mutations byte-safe.

export interface EnvEntry {
  kind: "entry";
  /** Position in the file's line array — the handle mutations take. */
  index: number;
  key: string;
  value: string;
  raw: string;
}

export interface EnvOther {
  kind: "other";
  index: number;
  raw: string;
}

export type EnvLine = EnvEntry | EnvOther;

/** What qualifies as an env key, for validating table edits. */
export const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

// prefix (indent + optional `export `), key, separator (spacing around `=`),
// value (everything after). The prefix admits only whitespace and `export`,
// so full-line comments never match and stay "other".
const ENTRY_RE = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_.-]*)(\s*=\s*)(.*)$/;

export function parseEnvText(text: string): EnvLine[] {
  return text.split("\n").map((raw, index): EnvLine => {
    const m = ENTRY_RE.exec(raw);
    if (!m) return { kind: "other", index, raw };
    return { kind: "entry", index, key: m[2]!, value: m[4]!, raw };
  });
}

/**
 * Rewrite the key and/or value of the entry line at `index`, preserving its
 * prefix and `=` spacing. Returns the text unchanged if the line isn't an
 * entry (stale index) — callers re-parse after every mutation anyway.
 */
export function setEntry(
  text: string,
  index: number,
  next: { key?: string; value?: string },
): string {
  const lines = text.split("\n");
  const raw = lines[index];
  if (raw === undefined) return text;
  const m = ENTRY_RE.exec(raw);
  if (!m) return text;
  lines[index] = `${m[1]}${next.key ?? m[2]}${m[3]}${next.value ?? m[4]}`;
  return lines.join("\n");
}

/** Delete the line at `index` (entry or otherwise). */
export function removeLine(text: string, index: number): string {
  const lines = text.split("\n");
  if (index < 0 || index >= lines.length) return text;
  lines.splice(index, 1);
  return lines.join("\n");
}

/** Delete several lines at once (bulk selection); indices may be unordered. */
export function removeLines(text: string, indices: number[]): string {
  const lines = text.split("\n");
  for (const i of [...indices].sort((a, b) => b - a)) {
    if (i >= 0 && i < lines.length) lines.splice(i, 1);
  }
  return lines.join("\n");
}

/**
 * Append `KEY=value` as a new last line, following the file's trailing-newline
 * style (a file that ends with \n keeps ending with \n).
 */
export function appendEntry(text: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  if (text === "") return `${line}\n`;
  if (text.endsWith("\n")) return `${text}${line}\n`;
  return `${text}\n${line}`;
}

/**
 * True when a paste looks like a block of env lines rather than a single
 * value: multi-line with at least one KEY=VALUE entry. Single-line pastes
 * never match, so values containing `=` paste normally into inputs.
 */
export function isEnvBlock(block: string): boolean {
  const normalized = block.replace(/\r\n/g, "\n");
  if (!normalized.includes("\n")) return false;
  return normalized.split("\n").some((line) => ENTRY_RE.test(line));
}

/**
 * Append a pasted env block verbatim (comments, blank lines, and formatting
 * survive), following the file's trailing-newline style.
 */
export function appendBlock(text: string, block: string): string {
  const clean = block.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  if (text === "") return `${clean}\n`;
  if (text.endsWith("\n")) return `${text}${clean}\n`;
  return `${text}\n${clean}`;
}

export interface EntryChange {
  status: "added" | "modified";
  /** The baseline value, present when status is "modified". */
  baseValue?: string;
}

/**
 * Per-row change status of `current`'s entries against a baseline text.
 * Entries pair by key in occurrence order (duplicate keys pair first-to-first,
 * second-to-second), so a renamed key reads as one removal plus one addition.
 * `changes` is keyed by the entry's line index in `current`; `removed` lists
 * baseline entries with no counterpart, in baseline order.
 */
export function diffEntryRows(
  baseline: string,
  current: string,
): {
  changes: Map<number, EntryChange>;
  removed: { key: string; value: string }[];
} {
  const isEntry = (l: EnvLine): l is EnvEntry => l.kind === "entry";
  const baseEntries = parseEnvText(baseline).filter(isEntry);
  const currentEntries = parseEnvText(current).filter(isEntry);

  const byKey = new Map<string, EnvEntry[]>();
  for (const e of baseEntries) {
    const list = byKey.get(e.key);
    if (list) list.push(e);
    else byKey.set(e.key, [e]);
  }

  const changes = new Map<number, EntryChange>();
  const used = new Map<string, number>();
  for (const e of currentEntries) {
    const n = used.get(e.key) ?? 0;
    used.set(e.key, n + 1);
    const base = byKey.get(e.key)?.[n];
    if (!base) changes.set(e.index, { status: "added" });
    else if (base.value !== e.value) {
      changes.set(e.index, { status: "modified", baseValue: base.value });
    }
  }

  const removed: { key: string; value: string }[] = [];
  const seen = new Map<string, number>();
  for (const e of baseEntries) {
    const n = seen.get(e.key) ?? 0;
    seen.set(e.key, n + 1);
    if (n >= (used.get(e.key) ?? 0)) removed.push({ key: e.key, value: e.value });
  }

  return { changes, removed };
}
