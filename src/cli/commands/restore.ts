// SPDX-License-Identifier: MIT

import { realpath } from "node:fs/promises";
import path from "node:path";
import { command } from "../invocation.ts";
import { requireApi } from "../session.ts";
import { readProjectConfig } from "../project-file.ts";
import { allFiles, type ProjectConfig } from "../project-config.ts";
import { confirmOrFail, requireVault, shellArg, unlockedVault } from "../common.ts";
import { CliError, done, emit, say, style, warn } from "../ui.ts";
import { confirm } from "../prompt.ts";
import type { ParsedArgs } from "../args.ts";
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
  // Real paths, so a checkout reached through a symlink (macOS's /tmp is
  // /private/tmp) matches what this machine recorded when it last synced.
  const root = await realpath(path.resolve(cwd, args.positionals[0] ?? ".")).catch(() =>
    path.resolve(cwd, args.positionals[0] ?? "."),
  );
  const here = await realpath(cwd).catch(() => cwd);
  const shown = (dir: string) => path.relative(root, dir) || ".";

  const projects: { dir: string; config: ProjectConfig }[] = [];
  const problems: { dir: string; error: string }[] = [];
  for (const dir of await findProjects(root)) {
    try {
      const config = await readProjectConfig(dir);
      if (config) projects.push({ dir, config });
    } catch (err) {
      problems.push({ dir: shown(dir), error: message(err) });
      warn(`${shown(dir)}: ${message(err)}`);
    }
  }

  if (projects.length === 0) {
    throw new CliError("not_linked", `No linked checkouts under ${root}.`, {
      hint: "Clone your repos (their .klef.json is committed), then run this again.",
    });
  }

  say(`Linked checkouts under ${root}:`);
  const width = Math.max(...projects.map((p) => shown(p.dir).length));
  for (const { dir, config } of projects) {
    const files = allFiles(config).map((f) => f.file).join(", ");
    say(`  ${shown(dir).padEnd(width)}  ${config.workspace} / ${config.project}  ${style.dim(files)}`);
  }
  const question = projects.length === 1 ? "Restore it?" : `Restore these ${projects.length}?`;
  if (!(await confirmOrFail(question, "restore", args, ask))) {
    say("Nothing restored.");
    return 1;
  }

  const api = await requireApi(env);
  const tree = await api.tree();
  const cipher = await unlockedVault(await requireVault(api), env, prompt);
  const ctx = { api, tree, cipher, env };

  const report: Record<string, unknown>[] = [];
  const leftOver: string[] = [];
  for (const { dir, config } of projects) {
    say();
    say(style.bold(shown(dir)));
    const entry = { dir: shown(dir), workspace: config.workspace, project: config.project, files: [] as unknown[] };
    report.push(entry);
    try {
      const files = await inspectProject(ctx, dir, config, allFiles(config));
      for (const line of await applySync(ctx, dir, config, files, new Set(["in-sync", "pull"]))) done(line, "  ");
      for (const file of files) {
        const { action, reason } = file.decision;
        entry.files.push({ path: path.relative(dir, file.destination), action, reason });
        if (action === "pull") continue;
        say(`  ${path.relative(dir, file.destination)}  ${action === "in-sync" ? style.dim(reason) : reason}`);
        if (action !== "in-sync" && action !== "absent") leftOver.push(dir);
      }
    } catch (err) {
      problems.push({ dir: shown(dir), error: message(err) });
      warn(`${shown(dir)}: ${message(err)}`);
    }
  }

  const needSync = [...new Set(leftOver)];
  const data = { root, projects: report, problems };
  if (needSync.length) {
    throw new CliError(
      "conflict",
      `Restored what could be pulled. ${needSync.length === 1 ? "1 checkout needs" : `${needSync.length} checkouts need`} a sync to settle the rest.`,
      { next: needSync.map((dir) => command(`sync -C ${shellArg(cdPath(here, dir))}`)), data },
    );
  }
  emit(data);
  return problems.length ? 1 : 0;
}

/** A directory to pass to -C: relative when that is short, absolute when not. */
function cdPath(from: string, dir: string): string {
  const rel = path.relative(from, dir) || ".";
  return rel.split(path.sep).filter((part) => part === "..").length > 2 ? dir : rel;
}
