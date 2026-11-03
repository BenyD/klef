// SPDX-License-Identifier: MIT
//
// Merging a local env file and the vault's copy by key, for `sync --merge`.
// Pure: three texts in, one text and a report of key names out.
//
// The merged text is the local file edited in place, the way the web app's
// table editor edits (src/shared/env-table.ts): a changed value rewrites
// that one line, a key the vault has is appended as the vault's own line, and
// a key deleted on the other side loses its lines. Comments, order, spacing
// and quoting in the local file are left exactly as they were, so the blob
// stays raw text rather than becoming a re-serialised list.
//
// With a base (the version this machine last synced), it is a three-way
// merge: whichever side changed a key since the base wins, and a key one side
// deleted stays deleted, so a deliberate removal is never brought back.
// Without one (the first sync on this machine) there is nothing to say what
// was deleted, so it takes the union of keys. Either way, a key whose value
// differs on both sides is a conflict, and a merge with conflicts writes
// nothing.
//
// Keys are compared by their whole value, every line of a multi-line one.
// Lines that are not part of any key (comments, mostly) are not merged: when
// the vault changed them since the base and this file has them differently,
// the merge stops rather than quietly keep this file's, and `otherLines` says
// so.

import { appendEntry, entryLines, fullValue, parseEnvText, removeLines, replaceEntryValue } from "../shared/env-table.ts";

export interface MergeReport {
  /** The merged text, or null when there are conflicts. */
  text: string | null;
  /** Keys whose values differ on both sides (changed on both since the base). */
  conflicts: string[];
  /** Keys this file gains or changes from the vault. */
  fromVault: string[];
  /** Keys the vault gains or changes from this file. */
  fromLocal: string[];
  /** Keys removed here because the vault deleted them since the base. */
  removedHere: string[];
  /** Keys the vault loses because this file deleted them since the base. */
  removedThere: string[];
  /** The vault changed comments or other non-key lines that differ here too: no merge. */
  otherLines: boolean;
}

interface Entries {
  /** Last assignment's whole raw value per key: what a loader would use. */
  values: Map<string, string>;
  /** Line indices of every assignment per key. */
  lines: Map<string, number[]>;
  /** Raw lines of the last assignment, every line of a multi-line one, to copy across as written. */
  raw: Map<string, string>;
  order: string[];
  /** The lines that belong to no key, blank ones left out. */
  other: string[];
}

function entries(text: string): Entries {
  const out: Entries = { values: new Map(), lines: new Map(), raw: new Map(), order: [], other: [] };
  const raws = text.split("\n");
  const inEntry = new Set<number>();
  for (const line of parseEnvText(text)) {
    if (line.kind !== "entry") continue;
    if (!out.values.has(line.key)) out.order.push(line.key);
    const covered = entryLines(line);
    for (const i of covered) inEntry.add(i);
    out.values.set(line.key, fullValue(line));
    out.raw.set(line.key, covered.map((i) => raws[i]).join("\n"));
    out.lines.set(line.key, [...(out.lines.get(line.key) ?? []), line.index]);
  }
  out.other = raws.filter((raw, i) => !inEntry.has(i) && raw.trim() !== "").map((raw) => raw.replace(/\r$/, ""));
  return out;
}

const sameLines = (a: string[], b: string[]) => a.length === b.length && a.every((line, i) => line === b[i]);

const sorted = (keys: string[]) => keys.sort((a, b) => a.localeCompare(b));

export function mergeEnv(local: string, vault: string, base: string | null): MergeReport {
  const L = entries(local);
  const V = entries(vault);
  const B = base === null ? null : entries(base);

  const report: MergeReport = {
    text: null,
    conflicts: [],
    fromVault: [],
    fromLocal: [],
    removedHere: [],
    removedThere: [],
    otherLines: B !== null && !sameLines(V.other, B.other) && !sameLines(V.other, L.other),
  };
  const setHere = new Map<string, string>(); // key -> vault's raw value
  const addHere: string[] = []; // keys to append, vault order
  const dropHere: string[] = [];

  const keys = [...L.order, ...V.order.filter((k) => !L.values.has(k))];
  for (const key of keys) {
    const l = L.values.get(key);
    const v = V.values.get(key);
    if (l === v) continue;

    if (B === null) {
      if (l === undefined) {
        addHere.push(key);
        report.fromVault.push(key);
      } else if (v === undefined) {
        report.fromLocal.push(key);
      } else {
        report.conflicts.push(key);
      }
      continue;
    }

    const b = B.values.get(key);
    if (l === b) {
      // Unchanged here since the base: the vault's side wins.
      if (v === undefined) {
        dropHere.push(key);
        report.removedHere.push(key);
      } else if (l === undefined) {
        addHere.push(key);
        report.fromVault.push(key);
      } else {
        setHere.set(key, v);
        report.fromVault.push(key);
      }
    } else if (v === b) {
      // Unchanged in the vault since the base: this side wins.
      if (l === undefined) report.removedThere.push(key);
      else report.fromLocal.push(key);
    } else {
      report.conflicts.push(key);
    }
  }

  for (const list of [report.conflicts, report.fromVault, report.fromLocal, report.removedHere, report.removedThere]) {
    sorted(list);
  }
  if (report.conflicts.length || report.otherLines) return report;

  // Bottom up, so a multi-line value growing or shrinking doesn't move the
  // lines still to be edited.
  const edits = [
    ...[...setHere].map(([key, value]) => ({ index: L.lines.get(key)!.at(-1)!, value })),
    ...dropHere.flatMap((key) => L.lines.get(key)!.map((index) => ({ index, value: null }))),
  ].sort((a, b) => b.index - a.index);
  let text = local;
  for (const edit of edits) {
    text = edit.value === null ? removeLines(text, [edit.index]) : replaceEntryValue(text, edit.index, edit.value);
  }
  for (const key of addHere) text = appendRaw(text, V.raw.get(key)!, key, V.values.get(key)!);
  report.text = text;
  return report;
}

/** Append the vault's own line for a key, keeping its quoting and spacing. */
function appendRaw(text: string, raw: string, key: string, value: string): string {
  // appendEntry writes `KEY=value` and handles the trailing newline; swap in
  // the vault's exact line so `export`, spacing and quotes come across.
  const appended = appendEntry(text, key, value);
  const plain = `${key}=${value}`;
  const at = appended.lastIndexOf(plain);
  return `${appended.slice(0, at)}${raw.trimEnd()}${appended.slice(at + plain.length)}`;
}

/** True when the report says nothing changes on either side. */
export function mergeIsEmpty(report: MergeReport): boolean {
  return (
    report.fromVault.length + report.fromLocal.length + report.removedHere.length + report.removedThere.length === 0
  );
}
