// SPDX-License-Identifier: MIT
//
// What differs between two copies of an env file, by key. Pure, and shaped so
// that a value cannot get out: the result holds key names and nothing else,
// and the formatter only ever sees that result.
//
// Key names are printed. They are not secrets (`DATABASE_URL` says what a
// value is for, not what it is), and a diff that only said "3 lines changed"
// would not tell anyone which side to keep in a conflict.

import { isUnchanged } from "../shared/diff.ts";
import { valuesOf } from "../shared/env-drift.ts";

export interface KeyDiff {
  /** Keys in the local file and not in the vault's copy. */
  onlyLocal: string[];
  /** Keys in the vault's copy and not in the local file. */
  onlyVault: string[];
  /** Keys in both whose values differ. */
  changed: string[];
  /** Keys commented out here (`# KEY=`) and not set here: declared, unset. */
  declaredLocal: string[];
  /** Keys commented out in the vault's copy and not set there. */
  declaredVault: string[];
}

/** `# KEY=...` and `# export KEY=...`: a variable written down but switched off. */
const COMMENTED = /^\s*#\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=/;

/** Keys that appear only commented out in a text: declared, but not set. */
export function declaredUnset(text: string, set: ReadonlySet<string>): string[] {
  const out = new Set<string>();
  for (const line of text.split("\n")) {
    const m = COMMENTED.exec(line);
    if (m && !set.has(m[1]!)) out.add(m[1]!);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

export function keyDiff(local: string, vault: string): KeyDiff {
  const here = valuesOf(local);
  const there = valuesOf(vault);
  const sorted = (keys: Iterable<string>) => [...keys].sort((a, b) => a.localeCompare(b));
  return {
    onlyLocal: sorted([...here.keys()].filter((key) => !there.has(key))),
    onlyVault: sorted([...there.keys()].filter((key) => !here.has(key))),
    changed: sorted([...here.keys()].filter((key) => there.has(key) && there.get(key) !== here.get(key))),
    declaredLocal: declaredUnset(local, new Set(here.keys())),
    declaredVault: declaredUnset(vault, new Set(there.keys())),
  };
}

export function isEmptyDiff(diff: KeyDiff): boolean {
  return !diff.onlyLocal.length && !diff.onlyVault.length && !diff.changed.length;
}

/** Commented-out keys on one side or the other that the set-key lines did not already mention. */
function declaredOnly(diff: KeyDiff): { key: string; where: string }[] {
  const mentioned = new Set([...diff.onlyLocal, ...diff.onlyVault, ...diff.changed]);
  const both = diff.declaredLocal.filter((k) => diff.declaredVault.includes(k));
  return [
    ...both.filter((k) => !mentioned.has(k)).map((key) => ({ key, where: "declared, unset on both sides" })),
    ...diff.declaredLocal.filter((k) => !mentioned.has(k) && !both.includes(k)).map((key) => ({ key, where: "declared, unset here" })),
    ...diff.declaredVault.filter((k) => !mentioned.has(k) && !both.includes(k)).map((key) => ({ key, where: "declared, unset in the vault" })),
  ];
}

/**
 * The diff as indented lines, one key each, no values. Two texts that differ
 * while every key and value matches are reported as such, so "differs" never
 * comes with an empty explanation.
 */
export function formatKeyDiff(diff: KeyDiff, local: string, vault: string): string[] {
  const declared = declaredOnly(diff);
  if (isEmptyDiff(diff) && declared.length === 0) {
    return isUnchanged(local, vault)
      ? []
      : ["  Same keys and values; only comments, order or spacing differ."];
  }
  const width = Math.max(...[...diff.onlyLocal, ...diff.onlyVault, ...diff.changed, ...declared.map((d) => d.key)].map((k) => k.length));
  const note = (key: string, side: "here" | "vault") =>
    (side === "here" ? diff.declaredLocal : diff.declaredVault).includes(key)
      ? side === "here" ? " (declared, unset here)" : " (declared, unset in the vault)"
      : "";
  return [
    ...diff.onlyLocal.map((key) => `  + ${key.padEnd(width)}  only here${note(key, "vault")}`),
    ...diff.onlyVault.map((key) => `  - ${key.padEnd(width)}  only in the vault${note(key, "here")}`),
    ...diff.changed.map((key) => `  ~ ${key.padEnd(width)}  value differs`),
    ...declared.map(({ key, where }) => `  # ${key.padEnd(width)}  ${where}`),
  ];
}
