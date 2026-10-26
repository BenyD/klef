// SPDX-License-Identifier: AGPL-3.0-or-later
//
// How `klef setup` links a directory: to a whole project rather than one
// file, so `pull --all` brings down .env.local and .env.production together.
// Pure, like listing.ts: a tree goes in, choices and a config come out.

import type { VaultTree } from "../shared/api-types.ts";
import type { ProjectConfig } from "./project-config.ts";

export interface ProjectChoice {
  workspace: string;
  project: string;
  /** The env files in it, by vault name, in tree order. */
  files: { name: string; environment: string | null }[];
}

/** Every project that has at least one env file to sync. */
export function projectChoices(tree: VaultTree): ProjectChoice[] {
  const out: ProjectChoice[] = [];
  for (const workspace of tree.workspaces) {
    for (const project of workspace.projects) {
      if (project.files.length === 0) continue;
      out.push({
        workspace: workspace.name,
        project: project.name,
        files: project.files.map((f) => ({ name: f.name, environment: f.environment })),
      });
    }
  }
  return out;
}

/** "Personal / lensdrop (.env.local, .env.production)", for a numbered list. */
export function describeChoice(choice: ProjectChoice): string {
  return `${choice.workspace} / ${choice.project} (${choice.files.map((f) => f.name).join(", ")})`;
}

/**
 * The choice `--workspace` and `--project` name, matched without case like the
 * vault matches names. A project name alone is enough when it is unique.
 */
export function findChoice(
  choices: ProjectChoice[],
  workspace: string | null,
  project: string,
): ProjectChoice | null {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const matches = choices.filter(
    (c) => same(c.project, project) && (workspace === null || same(c.workspace, workspace)),
  );
  return matches.length === 1 ? matches[0]! : null;
}

/** Which file plain `pull` and `push` default to when no --file is given. */
const PREFERRED_DEFAULT = [".env.local", ".env"];

/**
 * A `.klef.json` for the whole project: every file listed for `--all`, each
 * living at its own name, and a sensible default for single-file commands.
 */
export function configForChoice(choice: ProjectChoice): ProjectConfig {
  const byName = (name: string) => choice.files.find((f) => f.name.toLowerCase() === name);
  const main = PREFERRED_DEFAULT.map(byName).find((f) => f !== undefined) ?? choice.files[0]!;
  return {
    workspace: choice.workspace,
    project: choice.project,
    file: main.name,
    environment: main.environment,
    files: choice.files.map((f) => ({ file: f.name, path: f.name })),
  };
}
