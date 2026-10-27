// SPDX-License-Identifier: AGPL-3.0-or-later

import path from "node:path";
import { command } from "../invocation.ts";
import { requireApi } from "../session.ts";
import { allFiles } from "../project-config.ts";
import { confirm } from "../prompt.ts";
import { hasFlag, type ParsedArgs } from "../args.ts";
import { formatKeyDiff, keyDiff, type KeyDiff } from "../key-diff.ts";
import { applySync, describePending, inspectProject, type FileSync } from "../project-sync.ts";
import type { SyncAction } from "../sync-plan.ts";
import { shellQuote } from "../../shared/shell.ts";
import { confirmOrFail, requireConfig, requireVault, unlockedVault } from "../common.ts";
import { CliError, done, emit, EXIT, say, style, type NextStep } from "../ui.ts";

const SYNC_ACTIONS: ReadonlySet<SyncAction> = new Set(["in-sync", "pull", "push", "create"]);

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

  const files = await inspectProject(ctx, cwd, config, allFiles(config));
  for (const line of describePlan(files, cwd)) say(line);
  const report = (extra: Record<string, unknown> = {}) => ({ dryRun, files: files.map((f) => fileJson(f, cwd)), ...extra });

  const conflicts = files.filter((f) => f.decision.action === "conflict");
  if (conflicts.length && dryRun) {
    // Read-only: a conflict is part of the answer, not a failure, so a
    // dry run reports it and exits 0 (5 with --exit-code), and a pipeline
    // reading its --json keeps working.
    for (const line of describeConflicts(conflicts, cwd)) say(line);
    say("Dry run: nothing written.");
    emit(report({ conflicts: conflicts.length }));
    return hasFlag(args, "exit-code") ? EXIT.conflict : EXIT.ok;
  }
  if (conflicts.length) {
    for (const line of describeConflicts(conflicts, cwd)) say(line);
    const one = conflicts.length === 1;
    throw new CliError(
      "conflict",
      `${one ? "1 file needs" : `${conflicts.length} files need`} a decision. Nothing was written.`,
      { hint: "Keep one side of each, then sync again:", next: resolutions(conflicts), data: report() },
    );
  }

  const pushes = files.filter((f) => f.decision.action === "push" || f.decision.action === "create");
  const pulls = files.filter((f) => f.decision.action === "pull");
  if (dryRun) {
    say(pulls.length + pushes.length ? "Dry run: nothing written." : "Nothing to do.");
    emit(report());
    return 0;
  }

  if (pushes.length) {
    for (const file of pushes) say(`Push ${style.bold(file.entry.file)}: ${describePending(file)}`);
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

/** The key-level diff of each conflict. Names, never values. */
export function describeConflicts(conflicts: FileSync[], cwd: string): string[] {
  const lines: string[] = [];
  for (const file of conflicts) {
    if (file.local && file.vault) {
      lines.push("", `${path.relative(cwd, file.destination)} against the vault:`);
      lines.push(...formatKeyDiff(keyDiff(file.local.text, file.vault.text), file.local.text, file.vault.text));
    }
  }
  return lines;
}

/** The two ways out of each conflict, as commands. */
function resolutions(conflicts: FileSync[]): NextStep[] {
  const out: NextStep[] = [];
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
