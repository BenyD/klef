// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Turning a vault tree into something to read or to parse.
//
// Pure, like resolve.ts: a tree goes in, strings or plain data come out.
// Nothing here touches the network, the filesystem, or a key — a listing is
// names only, which is exactly why it can be a read-only command at all.

import type { VaultTree } from "../shared/api-types.ts";

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

/**
 * Quote a name for a shell, but only when it needs it.
 *
 * Workspace names like "Maxapp GmbH" are ordinary, and a listing you cannot
 * paste is a listing that makes every reader re-derive the quoting by hand —
 * or get it wrong and link the wrong project.
 */
export function shellQuote(value: string): string {
  if (value === "") return "''";
  return /^[A-Za-z0-9._@%+:,/-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}

/** The argument list for `link`, ready to paste. */
export function linkArgs(entry: ListedFile): string {
  return [entry.workspace, entry.project, entry.file].map(shellQuote).join(" ");
}

/** What `--json` prints. Names and flags only; no ids, no ciphertext. */
export function listingJson(tree: VaultTree): { files: ListedFile[] } {
  return { files: listFiles(tree) };
}

/**
 * How awkward this entry is to paste. 0 = bare words, 1 = quoted, 2 = quoted
 * with an escaped apostrophe. An example reading `'Beny'\\''s Team'` teaches
 * shell escaping rather than the command, so prefer a cheaper one when the
 * vault offers it.
 */
function quotingCost(entry: ListedFile): number {
  const args = linkArgs(entry);
  if (args === [entry.workspace, entry.project, entry.file].join(" ")) return 0;
  return args.includes("\\'") ? 2 : 1;
}

/** The entry to show as the example: pullable first, then cheapest to paste. */
function pickExample(entries: ListedFile[]): ListedFile {
  const pullable = entries.filter((e) => e.hasVersion);
  const candidates = pullable.length ? pullable : entries;
  return candidates.reduce((best, e) => (quotingCost(e) < quotingCost(best) ? e : best));
}

function annotate(entry: ListedFile): string {
  const parts: string[] = [];
  if (entry.environment) parts.push(entry.environment);
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
