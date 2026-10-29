// SPDX-License-Identifier: MIT
//
// What each local env file looked like the last time it matched the vault, so
// `sync` can tell which side changed since. One record per local file: the
// vault version it matched, and the file's mtime and size at that moment.
//
// Deliberately no hash of the contents. A digest of a short env file is a
// guessable fingerprint of its values, and mtime plus size is enough to answer
// the only question asked here ("edited since?"). A false "edited" costs a
// conflict the user resolves; it can never cost a silent overwrite.
//
// Kept per machine, under the config directory, not in the repo: a new Mac
// starts with no records, which is exactly right, since nothing on it has
// been synced yet.

import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { configDir } from "./paths.ts";

export interface Baseline {
  /** The vault version the file matched. */
  versionId: string;
  mtimeMs: number;
  size: number;
}

type State = Record<string, Baseline>;

export function syncStateFile(env: NodeJS.ProcessEnv, home: string = homedir()): string {
  return path.join(configDir(env, home), "sync-state.json");
}

function isBaseline(value: unknown): value is Baseline {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.versionId === "string" && typeof v.mtimeMs === "number" && typeof v.size === "number";
}

/** Every record, keyed by absolute path. A missing or unreadable file is no records. */
export async function loadSyncState(env: NodeJS.ProcessEnv): Promise<State> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(syncStateFile(env), "utf8"));
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null) return {};
  const state: State = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (isBaseline(value)) state[key] = value;
  }
  return state;
}

/**
 * Record that each file now matches the given vault version, reading its
 * mtime and size from disk. Best effort: a pull or push that succeeded is not
 * failed by bookkeeping, and a missing record only makes the next `sync` ask.
 */
export async function recordSynced(
  env: NodeJS.ProcessEnv,
  synced: { file: string; versionId: string }[],
): Promise<void> {
  if (synced.length === 0) return;
  try {
    const state = await loadSyncState(env);
    for (const { file, versionId } of synced) {
      const info = await stat(file);
      state[path.resolve(file)] = { versionId, mtimeMs: info.mtimeMs, size: info.size };
    }
    const target = syncStateFile(env);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    // Write-then-rename, so two klef runs at once cannot leave half a file.
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await rename(temp, target);
  } catch {
    // See above: losing a record is safe, failing the command is not useful.
  }
}
