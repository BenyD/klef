// SPDX-License-Identifier: AGPL-3.0-or-later

import path from "node:path";
import { command } from "../invocation.ts";
import { requireApi } from "../session.ts";
import { readProjectConfig } from "../project-file.ts";
import { CONFIG_FILENAME } from "../project-config.ts";
import { openVault } from "../vault-key.ts";
import { syncTargets } from "../targets.ts";
import { flagValue, hasFlag, type ParsedArgs } from "../args.ts";
import { formatKeyDiff, keyDiff } from "../key-diff.ts";
import { inspectProject } from "../project-sync.ts";

/**
 * Compare local files with the vault's copies without writing either: the
 * linked file, the one `--file` names, or with `--all` every listed file.
 * Prints what `sync` would make of each and, where they differ, which keys
 * differ and how. Key names only; a value has no way into this output.
 *
 * Exits 0 whether or not anything differs. Differences are the answer here,
 * not a failure, and an agent reading a non-zero exit would retry.
 */
export async function diff(
  args: ParsedArgs,
  env: NodeJS.ProcessEnv,
  cwd: string,
  prompt?: (question: string) => Promise<string>,
): Promise<number> {
  const config = await readProjectConfig(cwd);
  if (!config) {
    console.error(`No ${CONFIG_FILENAME} here. Run \`${command("link")}\` first.`);
    return 1;
  }

  const targets = syncTargets(config, {
    all: hasFlag(args, "all"),
    file: flagValue(args, "file"),
    path: flagValue(args, "path"),
  });

  const api = await requireApi(env);
  const tree = await api.tree();
  const vault = await api.vault();
  if (!vault.exists || !vault.keyMaterial) {
    console.error("This account has no vault yet. Set one up in the web app first.");
    return 1;
  }
  const cipher = await openVault(vault.keyMaterial, env, prompt);

  const entries = targets.map((t) => ({ file: t.file, path: t.path ?? t.file }));
  const files = await inspectProject({ api, tree, cipher, env }, cwd, config, entries);

  for (const file of files) {
    console.log(`${path.relative(cwd, file.destination)}: ${file.decision.reason}`);
    if (file.local && file.vault) {
      for (const line of formatKeyDiff(keyDiff(file.local.text, file.vault.text), file.local.text, file.vault.text)) {
        console.log(line);
      }
    }
  }
  return 0;
}
