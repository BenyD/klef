// SPDX-License-Identifier: AGPL-3.0-or-later

import { command } from "../invocation.ts";
import { writeFile, chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import { requireApi } from "../session.ts";
import { readProjectConfig } from "../project-file.ts";
import { CONFIG_FILENAME, type ProjectConfig } from "../project-config.ts";
import { resolveTarget } from "../resolve.ts";
import { openVault } from "../vault-key.ts";
import { syncTargets } from "../targets.ts";
import { countVariables, describeWrite } from "../output.ts";
import { flagValue, hasFlag, type ParsedArgs } from "../args.ts";
import { resolveWritePath } from "../write-path.ts";

/** Env files are owner-only; they hold the plaintext this whole tool protects. */
const OWNER_ONLY = 0o600;

/**
 * Which file in the vault to pull. `--file` names a sibling in the same
 * project without re-linking the directory, which is how a repo holding both
 * .env.local and .env.production is handled; the linked file is the default.
 */
export function pullTarget(
  config: ProjectConfig,
  fileFlag: string | null,
): ProjectConfig {
  return fileFlag ? { ...config, file: fileFlag } : config;
}

/**
 * Write the vault's copy of this repo's env files to disk: the linked one, the
 * one `--file` names, or with `--all` every file `.klef.json` lists. However
 * many files, the vault is opened once, so `--all` asks for the passphrase at
 * most once and not at all while `klef unlock` holds the key.
 *
 * Note what is *not* here: no way to print a value, no --stdout, no --print.
 * The decrypted text goes to a file and nowhere else, because anything this
 * command writes to a terminal ends up in the context window of whatever agent
 * ran it. See docs/AGENT_ACCESS.md.
 */
export async function pull(
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

  // Resolve and check everything before writing anything, so `--all` either
  // writes every file or fails without touching the working tree.
  const planned = targets.map((target) => {
    const resolved = resolveTarget(tree, pullTarget(config, target.file));
    // Constrained to this directory on purpose: an agent that can be talked
    // into running `klef pull` must not be able to choose where the plaintext
    // lands.
    const destination = resolveWritePath(cwd, target.path ?? resolved.fileName);
    return { resolved, destination };
  });

  for (const { resolved } of planned) {
    if (!resolved.currentVersionId) {
      console.error(`"${resolved.fileName}" has no saved version yet, so there is nothing to pull.`);
      return 1;
    }
  }

  const vault = await api.vault();
  if (!vault.exists || !vault.keyMaterial) {
    console.error("This account has no vault yet. Set one up in the web app first.");
    return 1;
  }

  const versions = [];
  for (const { resolved } of planned) {
    const { version } = await api.currentVersion(resolved.fileId);
    if (!version) {
      console.error("The current version disappeared between listing and fetching it.");
      return 1;
    }
    versions.push(version);
  }

  // Everything above this line handled ciphertext only. The unlock is local,
  // either in this process or in the unlock agent, and the key is
  // non-extractable in both.
  const cipher = await openVault(vault.keyMaterial, env, prompt);
  const plaintexts = [];
  for (const version of versions) plaintexts.push(await cipher.decrypt(version.blob));

  for (const [i, { resolved, destination }] of planned.entries()) {
    const plaintext = plaintexts[i]!;
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, plaintext, { mode: OWNER_ONLY });
    await chmod(destination, OWNER_ONLY);

    console.log(
      describeWrite({
        path: path.relative(cwd, destination) || resolved.fileName,
        variableCount: countVariables(plaintext),
      }),
    );
  }
  return 0;
}
