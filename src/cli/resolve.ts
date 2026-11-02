// SPDX-License-Identifier: MIT
//
// Turning the names in `.klef.json` into the ids the API wants.
//
// Pure: takes a tree and names, returns ids or an explanation. Names are
// plaintext in Klef by design, which is what makes a name-keyed config file
// possible at all — nothing here needs the vault to be unlocked.

import { CliError } from "./ui.ts";
import type { ProjectNode, VaultTree, WorkspaceNode } from "../shared/api-types.ts";

export interface ResolvedTarget {
  workspaceId: string;
  projectId: string;
  fileId: string;
  /** Names as stored, which may differ in case from what was asked for. */
  workspaceName: string;
  projectName: string;
  fileName: string;
  environment: string | null;
  currentVersionId: string | null;
  /** Team files only: what your access lets you do with it. */
  access?: "admin" | "write" | "read" | "none";
}

export class ResolveError extends CliError {
  constructor(message: string) {
    super("not_found", message);
  }
}

/** Case-insensitive, so `.klef.json` doesn't have to match casing exactly. */
function findByName<T extends { name: string }>(items: T[], name: string): T | undefined {
  const wanted = name.trim().toLowerCase();
  return items.find((item) => item.name.trim().toLowerCase() === wanted);
}

function listOf(items: { name: string }[]): string {
  return items.length ? items.map((i) => `"${i.name}"`).join(", ") : "(none)";
}

/** The workspace and project a config names, or an explanation of which is missing. */
export function resolveProject(
  tree: VaultTree,
  target: { workspace: string; project: string },
): { workspace: WorkspaceNode; project: ProjectNode } {
  const workspace = findByName(tree.workspaces, target.workspace);
  if (!workspace) {
    throw new ResolveError(
      `No workspace named "${target.workspace}". Available: ${listOf(tree.workspaces)}`,
    );
  }

  const project = findByName(workspace.projects, target.project);
  if (!project) {
    throw new ResolveError(
      `No project named "${target.project}" in "${workspace.name}". ` +
        `Available: ${listOf(workspace.projects)}`,
    );
  }
  return { workspace, project };
}

/** A file in a project by name, or null when the project has none by that name. */
export function findFile(
  tree: VaultTree,
  target: { workspace: string; project: string; file: string },
): ResolvedTarget | null {
  const { workspace, project } = resolveProject(tree, target);
  const file = findByName(project.files, target.file);
  if (!file) return null;
  return {
    workspaceId: workspace.id,
    projectId: project.id,
    fileId: file.id,
    workspaceName: workspace.name,
    projectName: project.name,
    fileName: file.name,
    environment: file.environment,
    currentVersionId: file.currentVersionId,
    ...(file.access ? { access: file.access } : {}),
  };
}

/**
 * A team file in an environment your access does not cover cannot be pulled
 * or pushed: there is no key for it on this machine to use. Say so, rather
 * than letting the server's 404 read as a missing file.
 */
export function requireAccess(resolved: ResolvedTarget, write = false): ResolvedTarget {
  if (resolved.access === "none") {
    throw new CliError("no_access", `You do not have access to ${resolved.fileName} in ${resolved.workspaceName}.`, {
      hint: "A team admin can give it to you in the web app.",
    });
  }
  if (write && resolved.access === "read") {
    throw new CliError("no_access", `You can read ${resolved.fileName} in ${resolved.workspaceName} but not change it.`, {
      hint: "A team admin can give you edit access in the web app.",
    });
  }
  return resolved;
}

export function resolveTarget(
  tree: VaultTree,
  target: { workspace: string; project: string; file: string },
): ResolvedTarget {
  const resolved = findFile(tree, target);
  if (!resolved) {
    const { project } = resolveProject(tree, target);
    throw new ResolveError(
      `No file named "${target.file}" in "${project.name}". ` +
        `Available: ${listOf(project.files)}`,
    );
  }
  return resolved;
}
