// SPDX-License-Identifier: AGPL-3.0-or-later

import { writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { decryptBlob } from "../../shared/crypto.ts";
import { requireApi } from "../session.ts";
import { readProjectConfig } from "../project-file.ts";
import { CONFIG_FILENAME, type ProjectConfig } from "../project-config.ts";
import { resolveTarget } from "../resolve.ts";
import { unlockVault } from "../unlock.ts";
import { countVariables, describeWrite } from "../output.ts";
import { flagValue, type ParsedArgs } from "../args.ts";
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
 * Write the vault's copy of this repo's env file to disk.
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
    console.error(`No ${CONFIG_FILENAME} here. Run \`klef link\` first.`);
    return 1;
  }

  const wanted = pullTarget(config, flagValue(args, "file"));

  const api = await requireApi(env);
  const resolved = resolveTarget(await api.tree(), wanted);

  if (!resolved.currentVersionId) {
    console.error(`"${resolved.fileName}" has no saved version yet — nothing to pull.`);
    return 1;
  }

  const vault = await api.vault();
  if (!vault.exists || !vault.keyMaterial) {
    console.error("This account has no vault yet. Set one up in the web app first.");
    return 1;
  }

  const { version } = await api.currentVersion(resolved.fileId);
  if (!version) {
    console.error("The current version disappeared between listing and fetching it.");
    return 1;
  }

  // Everything above this line handled ciphertext only. The unlock is local,
  // and the key is non-extractable once derived.
  const dek = await unlockVault(vault.keyMaterial, prompt);
  const plaintext = await decryptBlob(dek, version.blob);

  // Constrained to this directory on purpose: an agent that can be talked into
  // running `klef pull` must not be able to choose where the plaintext lands.
  const target = resolveWritePath(cwd, flagValue(args, "path") ?? resolved.fileName);
  await writeFile(target, plaintext, { mode: OWNER_ONLY });
  await chmod(target, OWNER_ONLY);

  console.log(
    describeWrite({
      path: path.relative(cwd, target) || resolved.fileName,
      variableCount: countVariables(plaintext),
    }),
  );
  return 0;
}
