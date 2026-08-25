// SPDX-License-Identifier: AGPL-3.0-or-later

import { command } from "../invocation.ts";
import { readFile } from "node:fs/promises";
import { encryptBlob, decryptBlob } from "../../shared/crypto.ts";
import { diffLines, diffStats, finalNewlineNote, isUnchanged } from "../../shared/diff.ts";
import { requireApi } from "../session.ts";
import { readProjectConfig } from "../project-file.ts";
import { CONFIG_FILENAME } from "../project-config.ts";
import { resolveTarget } from "../resolve.ts";
import { unlockVault } from "../unlock.ts";
import { countVariables, describePush } from "../output.ts";
import { confirm } from "../prompt.ts";
import { pullTarget } from "./pull.ts";
import { resolveWritePath } from "../write-path.ts";
import { flagValue, hasFlag, type ParsedArgs } from "../args.ts";

/**
 * Send this directory's env file to the vault as a new version.
 *
 * Two properties make this safer than it sounds. Saves are append-only, so the
 * previous version stays and a mistake is recoverable from the web app. And
 * the passphrase is read from the terminal, so an agent cannot push
 * unattended; a human is present for every write by construction.
 *
 * The plaintext is uploaded exactly as it sits on disk. BLOB_FORMAT.md makes
 * the blob the source of truth byte-for-byte, so nothing here reformats,
 * sorts, or normalises line endings on the way up.
 */
export async function push(
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

  const wanted = pullTarget(config, flagValue(args, "file"));
  const source = resolveWritePath(cwd, flagValue(args, "path") ?? wanted.file);

  let plaintext: string;
  try {
    plaintext = await readFile(source, "utf8");
  } catch {
    console.error(`Can't read ${wanted.file} here. Nothing to push.`);
    return 1;
  }

  // An empty file is almost always a mistake rather than an intention, and it
  // would become the current version of everything that file holds.
  if (plaintext.trim() === "") {
    console.error(`${wanted.file} is empty. Refusing to push it over a saved version.`);
    return 1;
  }

  const api = await requireApi(env);
  const resolved = resolveTarget(await api.tree(), wanted);

  const vault = await api.vault();
  if (!vault.exists || !vault.keyMaterial) {
    console.error("This account has no vault yet. Set one up in the web app first.");
    return 1;
  }

  const dek = await unlockVault(vault.keyMaterial, prompt);

  const { version } = await api.currentVersion(resolved.fileId);
  const stored = version ? await decryptBlob(dek, version.blob) : "";

  if (version && isUnchanged(stored, plaintext)) {
    console.log(`${resolved.fileName} is already up to date. Nothing to push.`);
    return 0;
  }

  const stats = diffStats(diffLines(stored, plaintext));
  const summary = describePush({
    variableCount: countVariables(plaintext),
    added: stats.added,
    removed: stats.removed,
  });

  console.log(
    version
      ? `About to replace ${resolved.workspaceName} / ${resolved.projectName} / ${resolved.fileName}: ${summary}`
      : `About to create the first version of ${resolved.fileName}: ${summary}`,
  );
  const note = finalNewlineNote(stored, plaintext);
  if (note) console.log(`  ${note}`);
  if (version) console.log("  The version it replaces is kept and can be restored.");

  if (!hasFlag(args, "yes", "y") && !(await confirm("Push?"))) {
    console.log("Nothing pushed.");
    return 1;
  }

  const saved = await api.saveVersion(resolved.fileId, await encryptBlob(dek, plaintext));
  console.log(`Pushed ${summary} to ${resolved.fileName} (version ${saved.id.slice(0, 8)}).`);
  return 0;
}
