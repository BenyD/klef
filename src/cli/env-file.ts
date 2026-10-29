// SPDX-License-Identifier: MIT
//
// Reading and writing local env files, the one shape every command uses.

import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/** Env files are owner-only; they hold the plaintext this whole tool protects. */
export const OWNER_ONLY = 0o600;

export interface LocalFile {
  text: string;
  mtimeMs: number;
  size: number;
}

/** The file and its mtime and size, or null when it does not exist. */
export async function readLocalFile(file: string): Promise<LocalFile | null> {
  try {
    const [text, info] = await Promise.all([readFile(file, "utf8"), stat(file)]);
    return { text, mtimeMs: info.mtimeMs, size: info.size };
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") return null;
    throw err;
  }
}

/** Write plaintext exactly as given, owner-only, creating parent directories. */
export async function writeEnvFile(destination: string, plaintext: string): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, plaintext, { mode: OWNER_ONLY });
  // writeFile's mode applies only to a file it creates; an existing one keeps
  // whatever it had until this.
  await chmod(destination, OWNER_ONLY);
}
