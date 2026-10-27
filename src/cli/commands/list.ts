// SPDX-License-Identifier: AGPL-3.0-or-later

import { command } from "../invocation.ts";
import { requireApi } from "../session.ts";
import { formatListing, listFiles, listingJson } from "../listing.ts";
import { flagValue, hasFlag, type ParsedArgs } from "../args.ts";
import { requireConfig } from "../common.ts";
import { resolveTarget } from "../resolve.ts";
import type { KlefApi } from "../api.ts";
import type { VaultTree } from "../../shared/api-types.ts";
import { emit, say, style, uiMode } from "../ui.ts";

/**
 * Show what is in the vault, and change nothing.
 *
 * Seeing the vault used to be a side effect of running `link` with missing
 * arguments — which meant the only route to discovery was the command that
 * writes to the working directory. Discovery gets its own read-only surface
 * here, and `--json` so a script or an agent never has to parse prose that is
 * free to change between versions.
 *
 * Names only, like everything else this far out: no ids, no ciphertext, and
 * nothing that needs the vault unlocked.
 */
export async function list(args: ParsedArgs, env: NodeJS.ProcessEnv, cwd: string = process.cwd()): Promise<number> {
  const api = await requireApi(env);
  const tree = await api.tree();
  if (hasFlag(args, "versions")) return listVersions(args, api, tree, cwd);

  if (uiMode().json) {
    emit(listingJson(tree) as unknown as Record<string, unknown>);
    return 0;
  }

  const entries = listFiles(tree);
  const commands = { link: command("link"), list: command("list") };
  for (const line of formatListing(entries, commands)) say(line);
  return 0;
}

/**
 * The versions of one linked file, newest first: ids and dates only, nothing
 * that needs the vault unlocked. What `recover --from` takes.
 */
async function listVersions(args: ParsedArgs, api: KlefApi, tree: VaultTree, cwd: string): Promise<number> {
  const config = await requireConfig(cwd);
  const file = flagValue(args, "file") ?? config.file;
  const resolved = resolveTarget(tree, { ...config, file });
  const { versions } = await api.versions(resolved.fileId);
  emit({ file: resolved.fileName, versions });
  say(`Versions of ${resolved.workspaceName} / ${resolved.projectName} / ${resolved.fileName}, newest first:`);
  for (const v of versions) {
    const when = v.createdAt.replace("T", " ").slice(0, 16);
    say(`  ${v.id.slice(0, 8)}  ${when}${v.isCurrent ? `  ${style.dim("current")}` : ""}`);
  }
  if (versions.length === 0) say("  (none yet)");
  say(style.dim(`Bring one key back with: ${command("recover <KEY> --from <version>")}`));
  return 0;
}
