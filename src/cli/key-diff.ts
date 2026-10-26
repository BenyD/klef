// SPDX-License-Identifier: AGPL-3.0-or-later
//
// What differs between two copies of an env file, by key. Pure, and shaped so
// that a value cannot get out: the result holds key names and nothing else,
// and the formatter only ever sees that result.
//
// Key names are printed. They are not secrets (`DATABASE_URL` says what a
// value is for, not what it is), and a diff that only said "3 lines changed"
// would not tell anyone which side to keep in a conflict.

import { isUnchanged } from "../shared/diff.ts";
import { valuesOf } from "../web/lib/env-drift.ts";

export interface KeyDiff {
  /** Keys in the local file and not in the vault's copy. */
  onlyLocal: string[];
  /** Keys in the vault's copy and not in the local file. */
  onlyVault: string[];
  /** Keys in both whose values differ. */
  changed: string[];
}

export function keyDiff(local: string, vault: string): KeyDiff {
  const here = valuesOf(local);
  const there = valuesOf(vault);
  const sorted = (keys: Iterable<string>) => [...keys].sort((a, b) => a.localeCompare(b));
  return {
    onlyLocal: sorted([...here.keys()].filter((key) => !there.has(key))),
    onlyVault: sorted([...there.keys()].filter((key) => !here.has(key))),
    changed: sorted([...here.keys()].filter((key) => there.has(key) && there.get(key) !== here.get(key))),
  };
}

export function isEmptyDiff(diff: KeyDiff): boolean {
  return !diff.onlyLocal.length && !diff.onlyVault.length && !diff.changed.length;
}

/**
 * The diff as indented lines, one key each, no values. Two texts that differ
 * while every key and value matches are reported as such, so "differs" never
 * comes with an empty explanation.
 */
export function formatKeyDiff(diff: KeyDiff, local: string, vault: string): string[] {
  if (isEmptyDiff(diff)) {
    return isUnchanged(local, vault)
      ? []
      : ["  Same keys and values; only comments, order or spacing differ."];
  }
  const width = Math.max(...[...diff.onlyLocal, ...diff.onlyVault, ...diff.changed].map((k) => k.length));
  return [
    ...diff.onlyLocal.map((key) => `  + ${key.padEnd(width)}  only here`),
    ...diff.onlyVault.map((key) => `  - ${key.padEnd(width)}  only in the vault`),
    ...diff.changed.map((key) => `  ~ ${key.padEnd(width)}  value differs`),
  ];
}
