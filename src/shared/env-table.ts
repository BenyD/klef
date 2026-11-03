// SPDX-License-Identifier: MIT
//
// Line-level parsing and surgical edits for env text, backing the KV table
// editor. The crypto contract stores the raw pasted text byte-for-byte (see
// src/shared/BLOB_FORMAT.md), so the table editor must never re-serialize the
// whole file: every mutation rewrites exactly one line and leaves every other
// byte untouched. Comments, blank lines, indentation, `export ` prefixes, and
// spacing around `=` all survive edits verbatim.
//
// Deliberately line-based: a multi-line quoted value parses as one entry line
// (the opening line) plus "other" continuation lines, and `value` is the
// opening line's part. `span` carries the whole value for readers that need
// it. A continuation line is never an entry, however much it looks like one:
// the tail of a PEM body (`Abc123==`) would otherwise read as a key named
// after key material. Inline comments after a value are part of the value
// text. Both are honest trade-offs that keep the mutations byte-safe.
//
// CRLF files parse like LF ones: a line's trailing \r stays in `raw` and out
// of `value`, and edits put it back.

export interface EnvEntry {
  kind: "entry";
  /** Position in the file's line array — the handle mutations take. */
  index: number;
  key: string;
  value: string;
  raw: string;
  /**
   * Set when a quoted value runs onto later lines: the index of its closing
   * line, and the whole value from the opening quote to the line that closes
   * it, lines joined with \n.
   */
  span?: { end: number; value: string };
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
// value (everything after, including a lone \r or U+2028 inside it). The
// prefix admits only whitespace and `export`, so full-line comments never
// match and stay "other". Matched against a line without its trailing \r.
const ENTRY_RE = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_.-]*)(\s*=\s*)([\s\S]*)$/;

/** A line without the \r a CRLF file ends it with. */
function body(raw: string): string {
  return raw.endsWith("\r") ? raw.slice(0, -1) : raw;
}

/**
 * Where `quote` closes in `s`, searching from `from`: the next one, or for
 * double quotes the next one not escaped with a backslash. -1 if it doesn't.
 */
function closingQuote(s: string, quote: string, from: number): number {
  for (let i = from; i < s.length; i++) {
    if (quote === '"' && s[i] === "\\") i++;
    else if (s[i] === quote) return i;
  }
  return -1;
}

/**
 * The line that closes a value opened on line `index` but not closed there,
 * or -1. A quote that never closes is a one-line value, as dotenv loaders
 * read it, so one stray quote doesn't swallow the rest of the file.
 */
function closingLine(bodies: string[], index: number, value: string): number {
  const quote = value[0];
  if (quote !== '"' && quote !== "'" && quote !== "`") return -1;
  if (closingQuote(value, quote, 1) !== -1) return -1;
  for (let j = index + 1; j < bodies.length; j++) {
    if (closingQuote(bodies[j]!, quote, 0) !== -1) return j;
  }
  return -1;
}

export function parseEnvText(text: string): EnvLine[] {
  const raws = text.split("\n");
  const bodies = raws.map(body);
  const lines: EnvLine[] = [];
  for (let index = 0; index < raws.length; index++) {
    const raw = raws[index]!;
    const m = ENTRY_RE.exec(bodies[index]!);
    if (!m) {
      lines.push({ kind: "other", index, raw });
      continue;
    }
    const entry: EnvEntry = { kind: "entry", index, key: m[2]!, value: m[4]!, raw };
    const end = closingLine(bodies, index, entry.value);
    if (end !== -1) {
      entry.span = { end, value: [entry.value, ...bodies.slice(index + 1, end + 1)].join("\n") };
    }
    lines.push(entry);
    while (index < end) {
      index++;
      lines.push({ kind: "other", index, raw: raws[index]! });
    }
  }
  return lines;
}

/** An entry's whole value: every line of a multi-line one, else its line's. */
export function fullValue(entry: EnvEntry): string {
  return entry.span?.value ?? entry.value;
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
  const line = body(raw);
  const m = ENTRY_RE.exec(line);
  if (!m) return text;
  const cr = raw.slice(line.length);
  // A new value with line breaks takes the line's own ending at each one.
  const value = next.value === undefined ? m[4] : cr ? next.value.replace(/\r?\n/g, "\r\n") : next.value;
  lines[index] = `${m[1]}${next.key ?? m[2]}${m[3]}${value}${cr}`;
  return lines.join("\n");
}

/**
 * Give the entry at `index` a new value, replacing every line of a
 * multi-line one. For writers that set a key outright (`klef set`, a merge),
 * where keeping the old continuation lines would leave half a value behind.
 */
export function replaceEntryValue(text: string, index: number, value: string): string {
  const entry = parseEnvText(text)[index];
  if (!entry || entry.kind !== "entry") return text;
  const lines = text.split("\n");
  if (entry.span) lines.splice(index + 1, entry.span.end - index);
  return setEntry(lines.join("\n"), index, { value });
}

/** The line indices an entry covers: its own, and any continuation lines. */
export function entryLines(entry: EnvEntry): number[] {
  const end = entry.span?.end ?? entry.index;
  return Array.from({ length: end - entry.index + 1 }, (_, i) => entry.index + i);
}

/** Delete the line at `index` (entry or otherwise), with a multi-line value's continuation lines. */
export function removeLine(text: string, index: number): string {
  return removeLines(text, [index]);
}

/** Delete several lines at once (bulk selection); indices may be unordered. */
export function removeLines(text: string, indices: number[]): string {
  const parsed = parseEnvText(text);
  const doomed = new Set<number>();
  for (const i of indices) {
    const line = parsed[i];
    if (!line) continue;
    for (const j of line.kind === "entry" ? entryLines(line) : [i]) doomed.add(j);
  }
  if (doomed.size === 0) return text;
  return text
    .split("\n")
    .filter((_, i) => !doomed.has(i))
    .join("\n");
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
 * A single pasted `KEY=value` line (an optional `export ` and spacing around
 * `=` allowed), split for the table's add row: the key goes in the key field,
 * the value in the value field. Anything else (multi-line, a comment, no
 * `=`) returns null and pastes as typed.
 */
export function splitEntryLine(
  text: string,
): { key: string; value: string } | null {
  const line = text.replace(/\r?\n$/, "");
  if (line.includes("\n")) return null;
  const m = ENTRY_RE.exec(line);
  return m ? { key: m[2]!, value: m[4]! } : null;
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
    else if (fullValue(base) !== fullValue(e)) {
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
