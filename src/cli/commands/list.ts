// SPDX-License-Identifier: AGPL-3.0-or-later

import { command } from "../invocation.ts";
import { requireApi } from "../session.ts";
import { formatListing, listFiles, listingJson } from "../listing.ts";
import { hasFlag, type ParsedArgs } from "../args.ts";

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
export async function list(args: ParsedArgs, env: NodeJS.ProcessEnv): Promise<number> {
  const api = await requireApi(env);
  const tree = await api.tree();

  if (hasFlag(args, "json")) {
    console.log(JSON.stringify(listingJson(tree), null, 2));
    return 0;
  }

  const entries = listFiles(tree);
  const commands = { link: command("link"), list: command("list") };
  for (const line of formatListing(entries, commands)) console.log(line);
  return entries.length ? 0 : 1;
}
