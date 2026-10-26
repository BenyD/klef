// SPDX-License-Identifier: AGPL-3.0-or-later

import { command } from "../invocation.ts";
import { KlefApi } from "../api.ts";
import { requireApi } from "../session.ts";
import { CONFIG_FILENAME, type ProjectConfig } from "../project-config.ts";
import { readProjectConfig, writeProjectConfig } from "../project-file.ts";
import { resolveTarget } from "../resolve.ts";
import { formatListing, listFiles } from "../listing.ts";
import { flagValue, type ParsedArgs } from "../args.ts";
import { DEFAULT_FILES, defaultFileList, defaultLinkedFile } from "../default-files.ts";
import { existsSync } from "node:fs";
import path from "node:path";
import type { VaultTree } from "../../shared/api-types.ts";

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
  if (!workspace || !project) {
    return listAvailable(tree, cwd);
  }

  const vaultNames = projectFileNames(tree, workspace, project);
  const localNames = DEFAULT_FILES.filter((name) => existsSync(path.join(cwd, name)));
  const file =
    flagValue(args, "file") ?? args.positionals[2] ?? defaultLinkedFile(vaultNames);

  const resolved = resolveTarget(tree, { workspace, project, file });

  const config: ProjectConfig = {
    workspace: resolved.workspaceName,
    project: resolved.projectName,
    file: resolved.fileName,
    environment: resolved.environment,
  };
  // Re-linking to another file in the same project keeps the `files` list
  // someone wrote by hand; moving to a different project drops it, since its
  // names belong to the old one. Without one to keep, the conventional local
  // and production files are recorded so `sync` covers both from now on.
  const existing = await readProjectConfig(cwd).catch(() => null);
  if (
    existing?.files &&
    existing.workspace.toLowerCase() === config.workspace.toLowerCase() &&
    existing.project.toLowerCase() === config.project.toLowerCase()
  ) {
    config.files = existing.files;
  } else {
    const files = defaultFileList(resolved.fileName, vaultNames, localNames);
    if (files) config.files = files;
  }
  const written = await writeProjectConfig(cwd, config);

  console.log(
    `Linked to ${resolved.workspaceName} / ${resolved.projectName} / ${resolved.fileName}`,
  );
  if (config.files) {
    console.log(`Syncing ${config.files.map((entry) => entry.file).join(", ")}`);
  }
  console.log(`Wrote ${written}`);
  if (!resolved.currentVersionId) {
    console.log("This file has no saved version yet, so there's nothing to pull.");
  }
  return 0;
}

/** The file names in a project, or none when the names do not resolve yet. */
function projectFileNames(tree: VaultTree, workspace: string, project: string): string[] {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  return (
    tree.workspaces
      .find((w) => same(w.name, workspace))
      ?.projects.find((p) => same(p.name, project))
      ?.files.map((f) => f.name) ?? []
  );
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
