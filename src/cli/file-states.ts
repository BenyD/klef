// SPDX-License-Identifier: MIT
//
// Each linked file's sync state as far as it can be told without the
// passphrase, for `status` and for the end of `setup`: the local file's mtime
// and size and the vault's current version id, against what this machine
// last synced (sync-plan.ts, quickState).

import { stat } from "node:fs/promises";
import type { VaultTree } from "../shared/api-types.ts";
import { allFiles, type ProjectConfig } from "./project-config.ts";
import { findFile } from "./resolve.ts";
import { loadSyncState } from "./sync-state.ts";
import { quickState, type QuickState } from "./sync-plan.ts";
import { resolveWritePath } from "./write-path.ts";

export interface FileState {
  file: string;
  path: string;
  local: boolean;
  inVault: boolean;
  state: QuickState;
}

export async function fileStates(
  config: ProjectConfig,
  tree: VaultTree | null,
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<FileState[]> {
  const state = await loadSyncState(env);
  const out: FileState[] = [];
  for (const entry of allFiles(config)) {
    let destination: string;
    try {
      destination = resolveWritePath(cwd, entry.path);
    } catch {
      continue; // An unsafe path is reported by the commands that would use it.
    }
    const info = await stat(destination).catch(() => null);
    const local = info ? { mtimeMs: info.mtimeMs, size: info.size } : null;
    let found = null;
    try {
      found = tree ? findFile(tree, { ...config, file: entry.file }) : null;
    } catch {
      found = null; // The project itself is gone; every file reads as not in the vault.
    }
    const quick = tree
      ? quickState({ local, vaultVersionId: found?.currentVersionId ?? null, baseline: state[destination] ?? null })
      : "unknown";
    out.push({ file: entry.file, path: entry.path, local: local !== null, inVault: Boolean(found?.currentVersionId), state: quick });
  }
  return out;
}

