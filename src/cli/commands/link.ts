// SPDX-License-Identifier: AGPL-3.0-or-later

import { command } from "../invocation.ts";
import { KlefApi } from "../api.ts";
import { requireApi } from "../session.ts";
import { CONFIG_FILENAME, type ProjectConfig } from "../project-config.ts";
import { readProjectConfig, writeProjectConfig } from "../project-file.ts";
import { resolveTarget } from "../resolve.ts";
import { formatListing, listFiles } from "../listing.ts";
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

  // Same listing `list` prints, so the two never drift apart. Reaching this
  // path still means the link did not happen, hence the non-zero exit.
  const entries = listFiles(tree);
  const commands = { link: command("link"), list: command("list") };
  for (const line of formatListing(entries, commands)) console.log(line);
  if (entries.length) console.log(`\nThat writes ${CONFIG_FILENAME} here.`);
  return 1;
}
