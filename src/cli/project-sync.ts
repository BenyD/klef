// SPDX-License-Identifier: MIT
//
// The I/O half of `sync`, `diff` and `restore`: read both copies of each file,
// decide with sync-plan.ts, and carry the decision out. The commands differ
// only in what they print and which decisions they act on.

import path from "node:path";
import type { VaultTree } from "../shared/api-types.ts";
import { diffLines, diffStats } from "../shared/diff.ts";
import type { KlefApi } from "./api.ts";
import { environmentFor } from "./default-files.ts";
import { readLocalFile, writeEnvFile, type LocalFile } from "./env-file.ts";
import { countVariables, describePush, describeWrite } from "./output.ts";
import type { FileEntry, ProjectConfig } from "./project-config.ts";
import { findFile, resolveProject, type ResolvedTarget } from "./resolve.ts";
import { decideSync, type SyncDecision } from "./sync-plan.ts";
import { loadSyncState, recordSynced, type Baseline } from "./sync-state.ts";
import { mergeEnv, type MergeReport } from "./env-merge.ts";
import type { VaultCipher } from "./vault-key.ts";
import { resolveWritePath } from "./write-path.ts";
import { vaultFiles, type VaultFiles } from "./vault-files.ts";
import { environmentFromName } from "../shared/env-from-name.ts";

export interface FileSync {
  /** The vault name and the local path, relative to the project directory. */
  entry: FileEntry;
  /** Absolute local path, already checked to stay inside the project. */
  destination: string;
  /** Null when the project has no file of this name. */
  resolved: ResolvedTarget | null;
  local: LocalFile | null;
  vault: { text: string; versionId: string } | null;
  decision: SyncDecision;
  /** What this machine last synced, if anything: the base for a merge. */
  baseline: Baseline | null;
  /** Set by `sync --merge` for a file whose decision became "merge". */
  merge?: MergeReport;
}

export interface SyncContext {
  api: KlefApi;
  tree: VaultTree;
  cipher: VaultCipher;
  env: NodeJS.ProcessEnv;
}

// One file layer per context, so a team's keys are fetched once per run.
const files = new WeakMap<SyncContext, VaultFiles>();
function filesOf(ctx: SyncContext): VaultFiles {
  let f = files.get(ctx);
  if (!f) {
    f = vaultFiles(ctx.api, ctx.tree, ctx.cipher);
    files.set(ctx, f);
  }
  return f;
}

/**
 * Read and compare every entry. Paths are checked before anything is read,
 * so a bad entry fails the project rather than half of it. Writes nothing.
 */
export async function inspectProject(
  ctx: SyncContext,
  cwd: string,
  config: ProjectConfig,
  entries: FileEntry[],
): Promise<FileSync[]> {
  const destinations = entries.map((entry) => resolveWritePath(cwd, entry.path));
  const state = await loadSyncState(ctx.env);

  const out: FileSync[] = [];
  for (const [i, entry] of entries.entries()) {
    const destination = destinations[i]!;
    const resolved = findFile(ctx.tree, { ...config, file: entry.file });
    // A team environment your access does not cover is not yours to sync:
    // a repo can list .env.production while a developer only holds
    // development's key. It is left alone, on disk and in the vault.
    if (resolved?.access === "none") continue;
    const local = await readLocalFile(destination);

    let vault: FileSync["vault"] = null;
    if (resolved?.currentVersionId) {
      const { version } = await ctx.api.currentVersion(resolved.fileId);
      if (version) vault = { text: await filesOf(ctx).decrypt(version), versionId: version.id };
    }

    const decision = decideSync({
      local,
      inVault: resolved !== null,
      vault,
      baseline: state[destination] ?? null,
    });
    out.push({ entry, destination, resolved, local, vault, decision, baseline: state[destination] ?? null });
  }
  return out;
}

/** The pending push of one file, in shape only. */
export function describePending(file: FileSync): string {
  const text = file.local?.text ?? "";
  const stats = diffStats(diffLines(file.vault?.text ?? "", text));
  return describePush({ variableCount: countVariables(text), ...stats });
}

/**
 * Carry out the pulls, pushes and creates among `files`, and refresh the
 * record of what matched. Files whose action is not in `actions` are left
 * alone. Returns the lines to print, none of which carries a value.
 */
export async function applySync(
  ctx: SyncContext,
  cwd: string,
  config: ProjectConfig,
  files: FileSync[],
  actions: ReadonlySet<SyncDecision["action"]>,
): Promise<string[]> {
  const lines: string[] = [];
  const synced: { file: string; versionId: string; seen?: { mtimeMs: number; size: number } }[] = [];

  for (const file of files) {
    const { action } = file.decision;
    if (!actions.has(action)) continue;
    const shown = path.relative(cwd, file.destination);

    if (action === "in-sync") {
      synced.push({ file: file.destination, versionId: file.vault!.versionId, seen: file.local ?? undefined });
    } else if (action === "pull") {
      const text = file.vault!.text;
      await writeEnvFile(file.destination, text, cwd);
      synced.push({ file: file.destination, versionId: file.vault!.versionId });
      lines.push(describeWrite({ path: shown, variableCount: countVariables(text) }));
    } else if (action === "merge") {
      // Both sides gain what the other had: the merged text goes here, and
      // to the vault as a new version unless the vault already has it.
      const text = file.merge!.text!;
      if (text !== file.local!.text) await writeEnvFile(file.destination, text, cwd);
      let versionId = file.vault!.versionId;
      if (text !== file.vault!.text) {
        versionId = (await filesOf(ctx).save(file.resolved!.fileId, text, file.vault!.versionId)).id;
      }
      // Unwritten, the file is the one inspected: record that, so an edit
      // made since (at the push prompt) still reads as unsynced.
      synced.push({ file: file.destination, versionId, seen: text === file.local!.text ? file.local! : undefined });
      const { fromVault, fromLocal, removedHere, removedThere } = file.merge!;
      lines.push(
        `Merged ${file.resolved!.fileName}: ${fromVault.length + removedHere.length} ${fromVault.length + removedHere.length === 1 ? "change" : "changes"} here, ${fromLocal.length + removedThere.length} to the vault${versionId !== file.vault!.versionId ? ` (version ${versionId.slice(0, 8)})` : ""}`,
      );
    } else if (action === "push" || action === "create") {
      const summary = describePending(file);
      let fileId = file.resolved?.fileId;
      let fileName = file.resolved?.fileName ?? file.entry.file;
      if (!fileId) {
        const { project } = resolveProject(ctx.tree, config);
        const environment = environmentFor(file.entry.file);
        const created = await ctx.api.createFile(project.id, file.entry.file, environment);
        fileId = created.id;
        fileName = created.name;
        // The tree predates this file: tell the file layer where it lives,
        // with the label a team stores for it (its name's, when none given).
        filesOf(ctx).track(fileId, { projectId: project.id, environment: environment ?? environmentFromName(file.entry.file) });
      }
      const saved = await filesOf(ctx).save(fileId, file.local!.text, file.vault?.versionId ?? null);
      // The file as inspected, which is what was pushed: an edit since then
      // was not, so it must read as unsynced.
      synced.push({ file: file.destination, versionId: saved.id, seen: file.local! });
      lines.push(`Pushed ${summary} to ${fileName} (version ${saved.id.slice(0, 8)})`);
    }
  }

  await recordSynced(ctx.env, synced);
  return lines;
}

/**
 * `sync --merge`: turn each conflict that a key-level merge can settle into a
 * "merge", and leave the rest as conflicts that name only the keys whose
 * values differ. The base is the version this machine last synced, fetched
 * and decrypted; without one (the first sync here) the merge takes the union.
 */
export async function planMerges(ctx: SyncContext, files: FileSync[]): Promise<void> {
  for (const file of files) {
    if (file.decision.action !== "conflict" || !file.local || !file.vault || !file.resolved) continue;
    if (file.local.text.trim() === "") continue; // An empty file stays a conflict.
    let base: string | null = null;
    if (file.baseline) {
      try {
        const { version } = await ctx.api.version(file.resolved.fileId, file.baseline.versionId);
        base = await filesOf(ctx).decrypt(version);
      } catch {
        base = null; // The base is gone; fall back to the union.
      }
    }
    const report = mergeEnv(file.local.text, file.vault.text, base);
    file.merge = report;
    if (report.conflicts.length) {
      file.decision = {
        action: "conflict",
        reason: `values differ on both sides: ${report.conflicts.join(", ")}`,
      };
    } else if (report.otherLines) {
      file.decision = { action: "conflict", reason: "comments differ on both sides" };
    } else {
      const here = report.fromVault.length + report.removedHere.length;
      const there = report.fromLocal.length + report.removedThere.length;
      file.decision = { action: "merge", reason: `merge: ${here} from the vault, ${there} from here` };
    }
  }
}
