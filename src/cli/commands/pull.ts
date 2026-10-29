// SPDX-License-Identifier: MIT

import { command } from "../invocation.ts";
import path from "node:path";
import { requireApi } from "../session.ts";
import type { CurrentVersion } from "../api.ts";
import type { ProjectConfig } from "../project-config.ts";
import { resolveTarget } from "../resolve.ts";
import { requireConfig, requireVault, unlockedVault } from "../common.ts";
import { CliError, done, emit } from "../ui.ts";
import { syncTargets } from "../targets.ts";
import { countVariables, describeWrite } from "../output.ts";
import { flagValue, hasFlag, type ParsedArgs } from "../args.ts";
import { resolveWritePath } from "../write-path.ts";
import { writeEnvFile } from "../env-file.ts";
import { recordSynced } from "../sync-state.ts";

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
  const config = await requireConfig(cwd);

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
      throw new CliError("not_found", `${resolved.fileName} has no saved version yet, so there is nothing to pull.`, {
        hint: "Push it first, or save it in the web app.",
        next: [command(`push --file ${resolved.fileName}`)],
      });
    }
  }

  const keyMaterial = await requireVault(api);

  const versions: CurrentVersion[] = [];
  for (const { resolved } of planned) {
    const { version } = await api.currentVersion(resolved.fileId);
    if (!version) {
      throw new CliError("server", "The current version disappeared between listing and fetching it.", {
        hint: "Something saved at the same moment. Run it again.",
      });
    }
    versions.push(version);
  }

  // Everything above this line handled ciphertext only. The unlock is local,
  // either in this process or in the unlock agent, and the key is
  // non-extractable in both.
  const cipher = await unlockedVault(keyMaterial, env, prompt);
  const plaintexts = [];
  for (const version of versions) plaintexts.push(await cipher.decrypt(version.blob));

  const written: { file: string; path: string; variables: number; version: string }[] = [];
  for (const [i, { resolved, destination }] of planned.entries()) {
    const plaintext = plaintexts[i]!;
    await writeEnvFile(destination, plaintext);
    const shown = path.relative(cwd, destination) || resolved.fileName;
    const variables = countVariables(plaintext);
    written.push({ file: resolved.fileName, path: shown, variables, version: versions[i]!.id });
    done(describeWrite({ path: shown, variableCount: variables }));
  }
  // What `sync` measures "edited since" against.
  await recordSynced(
    env,
    planned.map(({ destination }, i) => ({ file: destination, versionId: versions[i]!.id })),
  );
  emit({ files: written });
  return 0;
}
