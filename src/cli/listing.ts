// SPDX-License-Identifier: MIT
//
// Turning a vault tree into something to read or to parse.
//
// Pure, like resolve.ts: a tree goes in, strings or plain data come out.
// Nothing here touches the network, the filesystem, or a key — a listing is
// names only, which is exactly why it can be a read-only command at all.

import type { VaultTree } from "../shared/api-types.ts";
import { hasAwkwardQuoting, shellQuote } from "../shared/shell.ts";
import { environmentWorthShowing } from "../shared/env-from-name.ts";

export interface ListedFile {
  workspace: string;
  project: string;
  file: string;
  environment: string | null;
  /** False until the file's first save — there is nothing to pull yet. */
  hasVersion: boolean;
}

/** Every env file in the vault, flattened, in tree order. */
export function listFiles(tree: VaultTree): ListedFile[] {
  const out: ListedFile[] = [];
  for (const workspace of tree.workspaces) {
    for (const project of workspace.projects) {
      for (const file of project.files) {
        out.push({
          workspace: workspace.name,
          project: project.name,
          file: file.name,
          environment: file.environment,
          hasVersion: file.currentVersionId !== null,
        });
      }
    }
  }
  return out;
}

/** The argument list for `link`, ready to paste. */
export function linkArgs(entry: ListedFile): string {
  // Quoted only where the shell would split or expand a name.
  const arg = (name: string) => (/^[\w.@%+=:,/-]+$/.test(name) ? name : shellQuote(name));
  return [entry.workspace, entry.project, entry.file].map(arg).join(" ");
}

/** What `--json` prints. Names and flags only; no ids, no ciphertext. */
export function listingJson(tree: VaultTree): { files: ListedFile[] } {
  return { files: listFiles(tree) };
}

/**
 * The entry to show as the example: one that has something to pull, and among
 * those one whose names avoid the '\'' escape. An example reading
 * `'Beny'\''s Team'` teaches shell escaping rather than the command.
 */
function pickExample(entries: ListedFile[]): ListedFile {
  const pullable = entries.filter((e) => e.hasVersion);
  const candidates = pullable.length ? pullable : entries;
  return (
    candidates.find((e) => ![e.workspace, e.project, e.file].some(hasAwkwardQuoting)) ??
    candidates[0]!
  );
}

function annotate(entry: ListedFile): string {
  const parts: string[] = [];
  // `.env.production (production)` says it twice; only a label the name
  // doesn't already carry is worth the space. --json keeps the raw field.
  const env = environmentWorthShowing(entry.file, entry.environment);
  if (env) parts.push(env);
  if (!entry.hasVersion) parts.push("no saved version yet");
  return parts.length ? `  (${parts.join(", ")})` : "";
}

/**
 * The human listing: grouped for reading, with one real, pasteable example
 * underneath rather than a syntax sketch the reader has to fill in.
 */
export function formatListing(
  entries: ListedFile[],
  commands: { link: string; list: string },
): string[] {
  if (!entries.length) {
    return ["No env files in your vault yet. Create one in the web app first."];
  }

  const lines = ["Available files:"];
  let heading = "";
  const width = Math.max(...entries.map((e) => e.file.length));

  for (const entry of entries) {
    const group = `${entry.workspace} / ${entry.project}`;
    if (group !== heading) {
      lines.push("", `  ${group}`);
      heading = group;
    }
    lines.push(`    ${entry.file.padEnd(width)}${annotate(entry)}`.trimEnd());
  }

  lines.push("", "Link one with:", `  ${commands.link} ${linkArgs(pickExample(entries))}`);
  lines.push("", `Machine-readable: ${commands.list} --json`);
  return lines;
}
