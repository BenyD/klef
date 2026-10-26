// SPDX-License-Identifier: AGPL-3.0-or-later
//
// How a Klef file and a deploy target disagree. Pure. Names are compared for
// every target; values only for Vercel, the one target that can be read, and
// only where a variable is not Sensitive. The result holds names and counts:
// a value goes in, and only "matches" or "differs" comes out.

import { sameName, type TargetKind, type VercelVar } from "./deploy-targets.ts";

export interface NameDrift {
  /** In the Klef file, not on the target. */
  missing: string[];
  /** On the target, not in the Klef file. */
  extra: string[];
}

export function nameDrift(kind: TargetKind, local: Iterable<string>, remote: Iterable<string>): NameDrift {
  const here = [...local];
  const there = [...remote];
  const sorted = (names: string[]) => names.sort((a, b) => a.localeCompare(b));
  return {
    missing: sorted(here.filter((n) => !there.some((r) => sameName(kind, n, r)))),
    extra: sorted(there.filter((r) => !here.some((n) => sameName(kind, n, r)))),
  };
}

export interface ValueDrift {
  matches: number;
  /** Names whose readable value differs from the Klef file's. */
  differs: string[];
  /** Names Vercel will not reveal (Sensitive), so nothing can be said. */
  unreadable: string[];
}

/** Compare values for the names both sides have. */
export function vercelValueDrift(local: Map<string, string>, remote: VercelVar[]): ValueDrift {
  const drift: ValueDrift = { matches: 0, differs: [], unreadable: [] };
  for (const { name, value } of remote) {
    if (!local.has(name)) continue;
    if (value === null) drift.unreadable.push(name);
    else if (value === local.get(name)) drift.matches++;
    else drift.differs.push(name);
  }
  drift.differs.sort((a, b) => a.localeCompare(b));
  drift.unreadable.sort((a, b) => a.localeCompare(b));
  return drift;
}

/** Indented report lines for one target. */
export function formatDrift(names: NameDrift, values: ValueDrift | null): string[] {
  const lines: string[] = [];
  if (names.missing.length) lines.push(`  missing there: ${names.missing.join(", ")}`);
  if (names.extra.length) lines.push(`  only there:    ${names.extra.join(", ")}`);
  if (!names.missing.length && !names.extra.length) lines.push("  names match");
  if (values) {
    const parts = [`${values.matches} ${values.matches === 1 ? "matches" : "match"}`];
    if (values.differs.length) parts.push(`differs: ${values.differs.join(", ")}`);
    if (values.unreadable.length) parts.push(`can't check (Sensitive): ${values.unreadable.join(", ")}`);
    lines.push(`  values: ${parts.join("; ")}`);
  }
  return lines;
}
