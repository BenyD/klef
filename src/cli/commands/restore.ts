// SPDX-License-Identifier: AGPL-3.0-or-later

import path from "node:path";
import { command } from "../invocation.ts";
import { requireApi } from "../session.ts";
import { readProjectConfig } from "../project-file.ts";
import { allFiles, type ProjectConfig } from "../project-config.ts";
import { openVault } from "../vault-key.ts";
import { confirm } from "../prompt.ts";
import { hasFlag, type ParsedArgs } from "../args.ts";
import { findProjects } from "../find-projects.ts";
import { applySync, inspectProject } from "../project-sync.ts";
import { redactAssignments } from "../output.ts";

/** An error as one line, redacted as index.ts does for the ones it catches. */
function message(err: unknown): string {
  return redactAssignments(err instanceof Error ? err.message : String(err));
}

/**
 * Bring back the env files of every linked checkout under a directory, for a
 * new or reset machine: clone the repos, then run this once.
 *
 * It pulls, and only pulls: a file that is missing here, or that changed in
 * the vault since this machine last synced it. Anything that would push, and
 * any conflict, is reported for `sync` to handle in that checkout, because a
 * restore that walked a whole folder and uploaded what it found would be a
 * very easy way to overwrite good versions with stale copies.
 *
 * The checkouts found are listed and confirmed before anything is decrypted.
 * `.klef.json` is committed, so a cloned repo can name any workspace and
 * project it likes; the list is where a stranger's repo asking for your
 * production file gets noticed.
 */
export async function restore(
  args: ParsedArgs,
  env: NodeJS.ProcessEnv,
  cwd: string,
  prompt?: (question: string) => Promise<string>,
  ask: (question: string) => Promise<boolean> = confirm,
): Promise<number> {
  const root = path.resolve(cwd, args.positionals[0] ?? ".");
  const shown = (dir: string) => path.relative(root, dir) || ".";

  const projects: { dir: string; config: ProjectConfig }[] = [];
  let problems = 0;
  for (const dir of await findProjects(root)) {
    try {
      const config = await readProjectConfig(dir);
      if (config) projects.push({ dir, config });
    } catch (err) {
      console.log(`${shown(dir)}: ${message(err)}`);
      problems++;
    }
  }

  if (projects.length === 0) {
    console.log(`No linked checkouts under ${root}. Clone your repos, then run this again.`);
    return 1;
  }

  console.log(`Linked checkouts under ${root}:`);
  for (const { dir, config } of projects) {
    const files = allFiles(config).map((f) => f.file).join(", ");
    console.log(`  ${shown(dir)}  ${config.workspace} / ${config.project}  (${files})`);
  }
  const question = projects.length === 1 ? "Restore it?" : `Restore these ${projects.length}?`;
  if (!hasFlag(args, "yes", "y") && !(await ask(question))) {
    console.log("Nothing restored.");
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

  const leftOver: string[] = [];
  for (const { dir, config } of projects) {
    console.log(`\n${shown(dir)}`);
    try {
      const files = await inspectProject(ctx, dir, config, allFiles(config));
      for (const line of await applySync(ctx, dir, config, files, new Set(["in-sync", "pull"]))) {
        console.log(`  ${line}`);
      }
      for (const file of files) {
        const { action, reason } = file.decision;
        if (action === "pull") continue;
        console.log(`  ${path.relative(dir, file.destination)}: ${reason}`);
        if (action !== "in-sync" && action !== "absent") leftOver.push(dir);
      }
    } catch (err) {
      console.log(`  ${message(err)}`);
      problems++;
    }
  }

  const needSync = [...new Set(leftOver)];
  if (needSync.length) {
    console.log(`\nRun \`${command("sync")}\` in ${needSync.map(shown).join(", ")} to settle the rest.`);
  }
  return needSync.length || problems ? 1 : 0;
}
