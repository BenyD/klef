// SPDX-License-Identifier: AGPL-3.0-or-later

import path from "node:path";
import { command } from "../invocation.ts";
import { requireApi } from "../session.ts";
import { allFiles } from "../project-config.ts";
import { confirm } from "../prompt.ts";
import { hasFlag, type ParsedArgs } from "../args.ts";
import { formatKeyDiff, keyDiff, type KeyDiff } from "../key-diff.ts";
import { applySync, describePending, inspectProject, planMerges, type FileSync } from "../project-sync.ts";
import type { SyncAction } from "../sync-plan.ts";
import { shellQuote } from "../../shared/shell.ts";
import { confirmOrFail, requireConfig, requireVault, unlockedVault } from "../common.ts";
import { CliError, done, emit, say, style, type NextStep } from "../ui.ts";

const SYNC_ACTIONS: ReadonlySet<SyncAction> = new Set(["in-sync", "pull", "push", "create", "merge"]);

/**
 * Bring every file in `.klef.json` and the vault into line, whichever side
 * changed. See sync-plan.ts for the rule; the short version is that the side
 * that changed since the last sync wins, and anything else stops for a human.
 *
 * On a conflict nothing is written, to either side, for any file: a sync that
 * did half its work and then asked a question would leave the next one with
 * less to go on. The conflict is shown as keys, never values, and exits 5.
 */
export async function sync(
  args: ParsedArgs,
  env: NodeJS.ProcessEnv,
  cwd: string,
  prompt?: (question: string) => Promise<string>,
  ask: (question: string) => Promise<boolean> = confirm,
): Promise<number> {
  const config = await requireConfig(cwd);
  const api = await requireApi(env);
  const tree = await api.tree();
  const cipher = await unlockedVault(await requireVault(api), env, prompt);
  const ctx = { api, tree, cipher, env };
  const dryRun = hasFlag(args, "dry-run");

  const merging = hasFlag(args, "merge");
  const files = await inspectProject(ctx, cwd, config, allFiles(config));
  if (merging) await planMerges(ctx, files);
  for (const line of describePlan(files, cwd)) say(line);
  const report = (extra: Record<string, unknown> = {}) => ({ dryRun, files: files.map((f) => fileJson(f, cwd)), ...extra });

  const conflicts = files.filter((f) => f.decision.action === "conflict");
  if (conflicts.length) {
    for (const line of describeConflicts(conflicts, cwd)) say(line);
    const one = conflicts.length === 1;
    throw new CliError(
      "conflict",
      `${one ? "1 file needs" : `${conflicts.length} files need`} a decision. Nothing was written.`,
      {
        hint: merging ? "Settle those keys, then sync again:" : "Keep one side of each, or merge them by key, then sync again:",
        next: resolutions(conflicts, merging),
        data: report(),
      },
    );
  }

  const merges = files.filter((f) => f.decision.action === "merge");
  for (const file of merges) for (const line of describeMerge(file)) say(line);
  const pushes = files.filter(
    (f) =>
      f.decision.action === "push" ||
      f.decision.action === "create" ||
      (f.decision.action === "merge" && f.merge!.text !== f.vault!.text),
  );
  const pulls = files.filter((f) => f.decision.action === "pull" || (f.decision.action === "merge" && f.merge!.text !== f.local!.text));
  if (dryRun) {
    say(pulls.length + pushes.length ? "Dry run: nothing written." : "Nothing to do.");
    emit(report());
    return 0;
  }

  if (pushes.length) {
    for (const file of pushes) {
      if (file.decision.action !== "merge") say(`Push ${style.bold(file.entry.file)}: ${describePending(file)}`);
    }
    const question = pushes.length === 1 ? "Push?" : `Push ${pushes.length} files?`;
    if (!(await confirmOrFail(question, "sync", args, ask))) {
      // Pulls are still safe to make: each one replaces a file nobody has
      // edited since it last matched the vault.
      for (const line of await applySync(ctx, cwd, config, files, new Set(["in-sync", "pull"]))) done(line);
      say("Nothing pushed.");
      return 1;
    }
  }

  const lines = await applySync(ctx, cwd, config, files, SYNC_ACTIONS);
  for (const line of lines) done(line);
  if (lines.length === 0) done("Everything is in sync");
  emit(report());
  return 0;
}

function fileJson(file: FileSync, cwd: string): Record<string, unknown> {
  const out: Record<string, unknown> = {
    file: file.entry.file,
    path: path.relative(cwd, file.destination),
    action: file.decision.action,
    reason: file.decision.reason,
  };
  if (file.decision.action === "conflict" && file.local && file.vault) {
    out.keys = keyDiff(file.local.text, file.vault.text) satisfies KeyDiff;
  }
  if (file.merge) {
    const { conflicts, fromVault, fromLocal, removedHere, removedThere } = file.merge;
    out.merge = { conflicts, fromVault, fromLocal, removedHere, removedThere, base: file.baseline ? "last-synced" : "none" };
  }
  return out;
}

/** One line per file: where it lives and what sync makes of it. */
export function describePlan(files: FileSync[], cwd: string): string[] {
  const shown = files.map((f) => path.relative(cwd, f.destination));
  const width = Math.max(...shown.map((s) => s.length));
  return files.map((f, i) => {
    const reason = f.decision.reason;
    const styled =
      f.decision.action === "conflict" ? style.red(reason) : f.decision.action === "in-sync" ? style.dim(reason) : reason;
    return `${shown[i]!.padEnd(width)}  ${styled}`;
  });
}

/** What a merge brings each side, by key name. */
export function describeMerge(file: FileSync): string[] {
  const m = file.merge!;
  const width = Math.max(0, ...[...m.fromVault, ...m.fromLocal, ...m.removedHere, ...m.removedThere].map((k) => k.length));
  const row = (sign: string, key: string, what: string) => `  ${sign} ${key.padEnd(width)}  ${style.dim(what)}`;
  return [
    ...m.fromVault.map((k) => row("+", k, "to here, from the vault")),
    ...m.removedHere.map((k) => row("-", k, "removed here (deleted in the vault)")),
    ...m.fromLocal.map((k) => row("+", k, "to the vault, from here")),
    ...m.removedThere.map((k) => row("-", k, "removed in the vault (deleted here)")),
  ];
}

/** The key-level diff of each conflict. Names, never values. */
export function describeConflicts(conflicts: FileSync[], cwd: string): string[] {
  const lines: string[] = [];
  for (const file of conflicts) {
    if (file.merge?.conflicts.length) {
      lines.push("", `${path.relative(cwd, file.destination)}: these keys differ on both sides:`);
      lines.push(...file.merge.conflicts.map((k) => `  ~ ${k}`));
      const gains = describeMerge(file);
      if (gains.length) lines.push("Once they are settled, the merge brings:", ...gains);
      continue;
    }
    if (file.local && file.vault) {
      lines.push("", `${path.relative(cwd, file.destination)} against the vault:`);
      lines.push(...formatKeyDiff(keyDiff(file.local.text, file.vault.text), file.local.text, file.vault.text));
    }
  }
  return lines;
}

/** The two ways out of each conflict, as commands. */
function resolutions(conflicts: FileSync[], merging: boolean): NextStep[] {
  const out: NextStep[] = [];
  if (!merging && conflicts.some((f) => f.local && f.vault)) {
    out.push({ command: command("sync --merge --dry-run"), description: "see what a key-by-key merge would do" });
  }
  for (const file of conflicts) {
    for (const key of file.merge?.conflicts ?? []) {
      out.push({ command: command(`set ${key} --file ${quoteIfNeeded(file.entry.file)}`), description: `settle ${key} here, then sync --merge again` });
    }
  }
  for (const file of conflicts) {
    const flag = `--file ${quoteIfNeeded(file.entry.file)}`;
    if (file.vault) out.push({ command: command(`pull ${flag}`), description: `take the vault's ${file.entry.file}` });
    if (file.local && file.local.text.trim() !== "") {
      out.push({ command: command(`push ${flag}`), description: `keep this ${file.entry.file}` });
    }
  }
  return out;
}

/** `.env.local` reads better bare; only a name the shell would split gets quotes. */
function quoteIfNeeded(name: string): string {
  return /^[\w.@%+=:,/-]+$/.test(name) ? name : shellQuote(name);
}
