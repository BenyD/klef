// SPDX-License-Identifier: AGPL-3.0-or-later

import path from "node:path";
import { command } from "../invocation.ts";
import { requireApi } from "../session.ts";
import { readProjectConfig } from "../project-file.ts";
import { allFiles, CONFIG_FILENAME } from "../project-config.ts";
import { openVault } from "../vault-key.ts";
import { confirm } from "../prompt.ts";
import { hasFlag, type ParsedArgs } from "../args.ts";
import { formatKeyDiff, keyDiff } from "../key-diff.ts";
import { applySync, describePending, inspectProject, type FileSync } from "../project-sync.ts";
import type { SyncAction } from "../sync-plan.ts";
import { shellQuote } from "../../shared/shell.ts";

const SYNC_ACTIONS: ReadonlySet<SyncAction> = new Set(["in-sync", "pull", "push", "create"]);

/**
 * Bring every file in `.klef.json` and the vault into line, whichever side
 * changed. See sync-plan.ts for the rule; the short version is that the side
 * that changed since the last sync wins, and anything else stops for a human.
 *
 * On a conflict nothing is written, to either side, for any file: a sync that
 * did half its work and then asked a question would leave the next one with
 * less to go on. The conflict is shown as keys, never values.
 */
export async function sync(
  args: ParsedArgs,
  env: NodeJS.ProcessEnv,
  cwd: string,
  prompt?: (question: string) => Promise<string>,
  ask: (question: string) => Promise<boolean> = confirm,
): Promise<number> {
  const config = await readProjectConfig(cwd);
  if (!config) {
    console.error(`No ${CONFIG_FILENAME} here. Run \`${command("link")}\` first.`);
    return 1;
  }

  const api = await requireApi(env);
  const tree = await api.tree();
  const vault = await api.vault();
  if (!vault.exists || !vault.keyMaterial) {
    console.error("This account has no vault yet. Set one up in the web app first.");
    return 1;
  }
  const cipher = await openVault(vault.keyMaterial, env, prompt);
  const ctx = { api, tree, cipher, env };

  const files = await inspectProject(ctx, cwd, config, allFiles(config));
  for (const line of describePlan(files, cwd)) console.log(line);

  const conflicts = files.filter((f) => f.decision.action === "conflict");
  if (conflicts.length) {
    for (const line of describeConflicts(conflicts, cwd)) console.log(line);
    return 1;
  }

  const pushes = files.filter((f) => f.decision.action === "push" || f.decision.action === "create");
  if (hasFlag(args, "dry-run")) {
    const moving = files.filter((f) => f.decision.action === "pull").length + pushes.length;
    console.log(moving ? "Dry run: nothing written." : "Nothing to do.");
    return 0;
  }

  if (pushes.length) {
    for (const file of pushes) {
      console.log(`About to push ${file.entry.file}: ${describePending(file)}`);
    }
    const question = pushes.length === 1 ? "Push?" : `Push ${pushes.length} files?`;
    if (!hasFlag(args, "yes", "y") && !(await ask(question))) {
      // Pulls are still safe to make: each one replaces a file nobody has
      // edited since it last matched the vault.
      const lines = await applySync(ctx, cwd, config, files, new Set(["in-sync", "pull"]));
      for (const line of lines) console.log(line);
      console.log("Nothing pushed.");
      return 1;
    }
  }

  const lines = await applySync(ctx, cwd, config, files, SYNC_ACTIONS);
  for (const line of lines) console.log(line);
  if (lines.length === 0) console.log("Everything is in sync.");
  return 0;
}

/** One line per file: where it lives and what sync makes of it. */
export function describePlan(files: FileSync[], cwd: string): string[] {
  const shown = files.map((f) => path.relative(cwd, f.destination));
  const width = Math.max(...shown.map((s) => s.length));
  return files.map((f, i) => `${shown[i]!.padEnd(width)}  ${f.decision.reason}`);
}

/** The key-level diff of each conflict, and the two ways out of it. */
export function describeConflicts(conflicts: FileSync[], cwd: string): string[] {
  const lines = [""];
  for (const file of conflicts) {
    if (file.local && file.vault) {
      lines.push(`${path.relative(cwd, file.destination)} against the vault:`);
      lines.push(...formatKeyDiff(keyDiff(file.local.text, file.vault.text), file.local.text, file.vault.text));
    }
  }
  lines.push("Nothing was written. Keep one side of each with:");
  for (const file of conflicts) {
    const flag = `--file ${quoteIfNeeded(file.entry.file)}`;
    if (file.vault) lines.push(`  ${command(`pull ${flag}`)}   take the vault's copy`);
    if (file.local && file.local.text.trim() !== "") {
      lines.push(`  ${command(`push ${flag}`)}   keep this one`);
    }
  }
  lines.push(`then run \`${command("sync")}\` again.`);
  return lines;
}

/** `.env.local` reads better bare; only a name the shell would split gets quotes. */
function quoteIfNeeded(name: string): string {
  return /^[\w.@%+=:,/-]+$/.test(name) ? name : shellQuote(name);
}
