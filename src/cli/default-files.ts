// SPDX-License-Identifier: MIT
//
// The env files a repo syncs when nobody has said otherwise. Pure: names in,
// a `files` list out, so `link` and its edge cases are tested without a vault.
//
// Most projects keep a local and a production file side by side, and the
// point of recording both at link time is that `sync` and `pull --all` cover
// them from then on without anyone remembering to edit `.klef.json`.

import type { FileEntry } from "./project-config.ts";

/** In the order `link` prefers one to be the linked file. */
export const DEFAULT_FILES = [".env.local", ".env.production"] as const;

/** The environment label a new vault file gets, by its conventional name. */
const ENVIRONMENT_BY_NAME: Record<string, string> = {
  ".env.local": "development",
  ".env.development": "development",
  ".env.development.local": "development",
  ".env.preview": "preview",
  ".env.production": "production",
  ".env.production.local": "production",
};

export function environmentFor(file: string): string | null {
  return ENVIRONMENT_BY_NAME[file.toLowerCase()] ?? null;
}

function has(names: readonly string[], name: string): boolean {
  const wanted = name.toLowerCase();
  return names.some((n) => n.toLowerCase() === wanted);
}

/**
 * The file `link` binds when no file was named: the first default the vault
 * project already has, else `.env`, which is what `link` defaulted to before
 * there were defaults. Only vault names count, since the linked file has to
 * exist there to resolve.
 */
export function defaultLinkedFile(vaultNames: readonly string[]): string {
  return DEFAULT_FILES.find((name) => has(vaultNames, name)) ?? ".env";
}

/**
 * The `files` list to record: the linked file plus every default that exists
 * in the vault project or in this directory. Null when that is the linked file
 * alone, which `allFiles` already covers without a list.
 *
 * The linked file always comes first and is always included, so adding the
 * list never drops the file `push` and `pull` used before it existed.
 */
export function defaultFileList(
  linked: string,
  vaultNames: readonly string[],
  localNames: readonly string[],
): FileEntry[] | null {
  const files = [linked];
  for (const name of DEFAULT_FILES) {
    if (has(files, name)) continue;
    // Take the vault's casing when it has one, since that is the name used.
    const stored = vaultNames.find((n) => n.toLowerCase() === name);
    if (stored) files.push(stored);
    else if (has(localNames, name)) files.push(name);
  }
  return files.length > 1 ? files.map((file) => ({ file, path: file })) : null;
}
