// SPDX-License-Identifier: AGPL-3.0-or-later

import { command } from "../invocation.ts";
import { KlefApi } from "../api.ts";
import { requireApi } from "../session.ts";
import { allFiles, CONFIG_FILENAME, serializeProjectConfig, type ProjectConfig } from "../project-config.ts";
import { readProjectConfig, writeProjectConfig } from "../project-file.ts";
import { resolveTarget } from "../resolve.ts";
import { formatListing, listFiles } from "../listing.ts";
import { shellArg } from "../common.ts";
import { CliError, cmd, done, emit, note, say, style, uiMode } from "../ui.ts";
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
  const changed = existing === null || serializeProjectConfig(existing) !== serializeProjectConfig(config);
  const written = changed ? await writeProjectConfig(cwd, config) : path.join(cwd, CONFIG_FILENAME);

  const files = allFiles(config);
  done(
    changed
      ? `Linked to ${resolved.workspaceName} / ${resolved.projectName}`
      : `Already linked to ${resolved.workspaceName} / ${resolved.projectName}`,
  );
  say(`  Files   ${files.map((entry) => entry.file).join(", ")}`);
  say(`  Config  ${path.relative(cwd, written) || CONFIG_FILENAME} ${style.dim("(names only, safe to commit)")}`);
  if (!resolved.currentVersionId) {
    note(`${resolved.fileName} has no saved version yet, so there is nothing to pull.`);
  }
  note(`Next: ${cmd(command("sync"), true)} to bring the files here.`);
  emit({
    workspace: config.workspace,
    project: config.project,
    file: config.file,
    files,
    config: path.relative(cwd, written) || CONFIG_FILENAME,
    changed,
  });
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
    say(`Already linked to ${existing.workspace} / ${existing.project}. Pass a workspace and project to change it.`);
    say();
  }

  // Same listing `list` prints, so the two never drift apart. Reaching this
  // path still means the link did not happen, hence the usage error.
  const entries = listFiles(tree);
  const commands = { link: command("link"), list: command("list") };
  if (!uiMode().json) for (const line of formatListing(entries, commands)) say(line);
  throw new CliError("usage", "Say which project to link.", {
    hint: `That writes ${CONFIG_FILENAME} here.`,
    next: entries.length ? [command(`link ${shellArg(entries[0]!.workspace)} ${shellArg(entries[0]!.project)}`)] : [],
    data: { files: entries },
  });
}
