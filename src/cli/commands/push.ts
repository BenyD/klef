// SPDX-License-Identifier: AGPL-3.0-or-later

import { command } from "../invocation.ts";
import { readFile } from "node:fs/promises";
import { diffLines, diffStats, finalNewlineNote, isUnchanged } from "../../shared/diff.ts";
import { requireApi } from "../session.ts";
import { readProjectConfig } from "../project-file.ts";
import { CONFIG_FILENAME } from "../project-config.ts";
import { resolveTarget, type ResolvedTarget } from "../resolve.ts";
import { openVault } from "../vault-key.ts";
import { syncTargets, type SyncTarget } from "../targets.ts";
import { countVariables, describePush } from "../output.ts";
import { confirm } from "../prompt.ts";
import { pullTarget } from "./pull.ts";
import { resolveWritePath } from "../write-path.ts";
import { flagValue, hasFlag, type ParsedArgs } from "../args.ts";
import { recordSynced } from "../sync-state.ts";

/**
 * Send this directory's env files to the vault as new versions: the linked
 * one, the one `--file` names, or with `--all` every file `.klef.json` lists.
 *
 * Two properties make this safer than it sounds. Saves are append-only, so the
 * previous version stays and a mistake is recoverable from the web app. And
 * the key comes from a passphrase typed at the terminal, either now or into
 * `klef unlock` earlier, so an agent cannot push unless a human unlocked.
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
  ask: (question: string) => Promise<boolean> = confirm,
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

  // Read every file before touching the network, so a missing or empty one
  // stops the whole push rather than half of it.
  const local: { target: SyncTarget; source: string; plaintext: string }[] = [];
  for (const target of targets) {
    const shown = target.path ?? target.file;
    const source = resolveWritePath(cwd, shown);

    let plaintext: string;
    try {
      plaintext = await readFile(source, "utf8");
    } catch {
      console.error(`Can't read ${shown} here. Nothing to push.`);
      return 1;
    }

    // An empty file is almost always a mistake rather than an intention, and
    // it would become the current version of everything that file holds.
    if (plaintext.trim() === "") {
      console.error(`${shown} is empty. Refusing to push it over a saved version.`);
      return 1;
    }
    local.push({ target, source, plaintext });
  }

  const api = await requireApi(env);
  const tree = await api.tree();
  const resolvedAll = local.map(({ target }) =>
    resolveTarget(tree, pullTarget(config, target.file)),
  );

  const vault = await api.vault();
  if (!vault.exists || !vault.keyMaterial) {
    console.error("This account has no vault yet. Set one up in the web app first.");
    return 1;
  }

  const cipher = await openVault(vault.keyMaterial, env, prompt);

  const pending: { resolved: ResolvedTarget; source: string; plaintext: string; summary: string }[] = [];
  // What `sync` measures "edited since" against: every file that now matches
  // the vault, whether it was pushed or already the same.
  const synced: { file: string; versionId: string }[] = [];
  for (const [i, { source, plaintext }] of local.entries()) {
    const resolved = resolvedAll[i]!;
    const { version } = await api.currentVersion(resolved.fileId);
    const stored = version ? await cipher.decrypt(version.blob) : "";

    if (version && isUnchanged(stored, plaintext)) {
      console.log(`${resolved.fileName} is already up to date. Nothing to push.`);
      synced.push({ file: source, versionId: version.id });
      continue;
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
    pending.push({ resolved, source, plaintext, summary });
  }

  if (pending.length === 0) {
    await recordSynced(env, synced);
    return 0;
  }

  // One question for the whole batch: the summaries above are the thing being
  // confirmed, and asking per file would turn --all back into a chore.
  const question = pending.length === 1 ? "Push?" : `Push ${pending.length} files?`;
  if (!hasFlag(args, "yes", "y") && !(await ask(question))) {
    console.log("Nothing pushed.");
    return 1;
  }

  for (const { resolved, source, plaintext, summary } of pending) {
    const saved = await api.saveVersion(resolved.fileId, await cipher.encrypt(plaintext));
    synced.push({ file: source, versionId: saved.id });
    console.log(`Pushed ${summary} to ${resolved.fileName} (version ${saved.id.slice(0, 8)}).`);
  }
  await recordSynced(env, synced);
  return 0;
}
