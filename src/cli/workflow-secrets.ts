// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Which secrets a repository's GitHub Actions workflows reference, for
// `klef audit github`. Comparing GitHub's secrets with all of .env.production
// buries the signal (Lensdrop: 16 secrets against 47 "only local" names);
// what matters is which secrets the workflows read and whether they are set.
//
// A regex over the YAML text, not a YAML parser: `secrets.NAME` and
// `secrets['NAME']` are the only ways to read one, and they read the same in
// any position. Names only; nothing here sees a value.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/** Provided by GitHub to every run, never set by hand. */
const BUILT_IN = new Set(["GITHUB_TOKEN"]);

const DOT = /\bsecrets\.([A-Za-z_][A-Za-z0-9_]*)/g;
const INDEXED = /\bsecrets\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\]/g;
/** `environment: production`, or `environment:` followed by `name: production`. */
const ENVIRONMENT = /^\s*environment:\s*['"]?([\w.-]+)['"]?\s*$/gm;
const ENVIRONMENT_NAME = /^\s*environment:\s*\n\s+name:\s*['"]?([\w.-]+)['"]?/gm;

export interface WorkflowRefs {
  /** Workflow files read, relative to the repository root. */
  files: string[];
  /** Secret names referenced, upper-cased as GitHub stores them. */
  secrets: string[];
  /** Deployment environments jobs run in, whose secrets they can read too. */
  environments: string[];
}

export function referencedSecrets(yaml: string): { secrets: string[]; environments: string[] } {
  const secrets = new Set<string>();
  for (const re of [DOT, INDEXED]) {
    for (const m of yaml.matchAll(re)) {
      const name = m[1]!.toUpperCase();
      if (!BUILT_IN.has(name)) secrets.add(name);
    }
  }
  const environments = new Set<string>();
  for (const re of [ENVIRONMENT, ENVIRONMENT_NAME]) {
    for (const m of yaml.matchAll(re)) if (!m[1]!.includes("${{")) environments.add(m[1]!);
  }
  return { secrets: [...secrets].sort(), environments: [...environments].sort() };
}

/** Every workflow under .github/workflows, or null when there is none. */
export async function readWorkflows(root: string): Promise<WorkflowRefs | null> {
  const dir = path.join(root, ".github", "workflows");
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => /\.ya?ml$/.test(n)).sort();
  } catch {
    return null;
  }
  if (names.length === 0) return null;
  const secrets = new Set<string>();
  const environments = new Set<string>();
  for (const name of names) {
    const found = referencedSecrets(await readFile(path.join(dir, name), "utf8"));
    for (const s of found.secrets) secrets.add(s);
    for (const e of found.environments) environments.add(e);
  }
  return {
    files: names.map((n) => `.github/workflows/${n}`),
    secrets: [...secrets].sort(),
    environments: [...environments].sort(),
  };
}
