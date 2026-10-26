// SPDX-License-Identifier: AGPL-3.0-or-later
//
// A file's environment, worked out from its name. `.env.local` is always
// development and `.env.production` always production, so a label on those
// says nothing the name doesn't. The stored environment field stays as the
// override: for names that imply nothing (`.env`, `secrets.env`) and for the
// rare file whose name says one thing and whose role is another.
//
// Shared by the web app (what to show, what to compare) and the CLI (which
// local file `klef audit` checks against which platform environment). Plain
// TypeScript only, so Node's type stripping runs it unbuilt.

/** Environments a name can imply. Staging keeps its own label. */
export type NamedEnvironment = "development" | "preview" | "production" | "staging";

// Checked against the end of the name, so a vault file called
// "mobile.env.local" reads like ".env.local". Longest suffixes first:
// ".env.production.local" must not read as plain ".env.local".
const SUFFIXES: readonly [string, NamedEnvironment][] = [
  [".env.development.local", "development"],
  [".env.production.local", "production"],
  [".env.development", "development"],
  [".env.production", "production"],
  [".env.preview", "preview"],
  [".env.staging", "staging"],
  [".env.local", "development"],
  [".dev.vars", "development"],
  [".prod.vars", "production"],
];

/** The environment a file name implies, or null when it implies none. */
export function environmentFromName(name: string): NamedEnvironment | null {
  const base = (name.split(/[\\/]/).pop() ?? name).trim().toLowerCase();
  for (const [suffix, env] of SUFFIXES) {
    if (base === suffix || base.endsWith(suffix)) return env;
  }
  return null;
}

/**
 * The environment a file actually stands for: the one set on it, else the
 * one its name implies. This is what comparisons, gap checks and the
 * platform audit go by.
 */
export function effectiveEnvironment(
  name: string,
  explicit: string | null | undefined,
): string | null {
  const set = explicit?.trim();
  return set ? set : environmentFromName(name);
}

/**
 * The environment worth printing next to a file name, or null. Only an
 * explicitly set environment the name doesn't already say: a plain `.env`
 * marked production shows "production"; `.env.production` marked
 * production shows nothing; `.env.local` marked production shows
 * "production", because the label is now the surprising part.
 */
export function environmentWorthShowing(
  name: string,
  explicit: string | null | undefined,
): string | null {
  const set = explicit?.trim();
  if (!set) return null;
  return set.toLowerCase() === environmentFromName(name) ? null : set;
}
