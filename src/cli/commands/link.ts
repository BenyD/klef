// SPDX-License-Identifier: AGPL-3.0-or-later

import { command } from "../invocation.ts";
import { KlefApi } from "../api.ts";
import { requireApi } from "../session.ts";
import { CONFIG_FILENAME, type ProjectConfig } from "../project-config.ts";
import { readProjectConfig, writeProjectConfig } from "../project-file.ts";
import { listTargets, resolveTarget } from "../resolve.ts";
import { flagValue, type ParsedArgs } from "../args.ts";

/**
 * Bind this directory to one file in the vault, writing `.klef.json`.
 *
 * The config is meant to be committed: it holds only names, which Klef stores
 * in plaintext anyway, so it leaks nothing a repo doesn't already reveal.
 */
export async function link(
  args: ParsedArgs,
  env: NodeJS.ProcessEnv,
  cwd: string,
): Promise<number> {
  const api = await requireApi(env);
  const tree = await api.tree();

  const workspace = flagValue(args, "workspace") ?? args.positionals[0];
  const project = flagValue(args, "project") ?? args.positionals[1];
  const file = flagValue(args, "file") ?? args.positionals[2] ?? ".env";

  if (!workspace || !project) {
    return listAvailable(tree, cwd);
  }

  const resolved = resolveTarget(tree, { workspace, project, file });

  const config: ProjectConfig = {
    workspace: resolved.workspaceName,
    project: resolved.projectName,
    file: resolved.fileName,
    environment: resolved.environment,
  };
  const written = await writeProjectConfig(cwd, config);

  console.log(
    `Linked to ${resolved.workspaceName} / ${resolved.projectName} / ${resolved.fileName}`,
  );
  console.log(`Wrote ${written}`);
  if (!resolved.currentVersionId) {
    console.log("This file has no saved version yet, so there's nothing to pull.");
  }
  return 0;
}

async function listAvailable(
  tree: Awaited<ReturnType<KlefApi["tree"]>>,
  cwd: string,
): Promise<number> {
  const existing = await readProjectConfig(cwd);
  if (existing) {
    console.log(
      `Already linked to ${existing.workspace} / ${existing.project} / ${existing.file}.`,
    );
    console.log("Pass a workspace and project to change it.\n");
  }

  const targets = listTargets(tree);
  if (!targets.length) {
    console.log("No env files in your vault yet. Create one in the web app first.");
    return 1;
  }

  console.log("Available files:");
  for (const target of targets) console.log(`  ${target}`);
  console.log(`\nLink one with:\n  ${command("link")} <workspace> <project> [file]`);
  console.log(`That writes ${CONFIG_FILENAME} here.`);
  return 1;
}
