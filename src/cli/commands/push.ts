// SPDX-License-Identifier: MIT

import { command } from "../invocation.ts";
import { readFile } from "node:fs/promises";
import { diffLines, diffStats, finalNewlineNote, isUnchanged } from "../../shared/diff.ts";
import { requireApi } from "../session.ts";
import { resolveTarget, type ResolvedTarget } from "../resolve.ts";
import { confirmOrFail, requireConfig, requireVault, unlockedVault } from "../common.ts";
import { CliError, done, emit, say, style } from "../ui.ts";
import path from "node:path";
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
  const config = await requireConfig(cwd);

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
      throw new CliError("not_found", `Can't read ${shown} here. Nothing pushed.`, {
        hint: "Pull it first, or check the path in .klef.json.",
        next: [command(`pull --file ${target.file}`)],
      });
    }

    // An empty file is almost always a mistake rather than an intention, and
    // it would become the current version of everything that file holds.
    if (plaintext.trim() === "") {
      throw new CliError("usage", `${shown} is empty. Nothing pushed: an empty file would replace the saved one.`);
    }
    local.push({ target, source, plaintext });
  }

  const api = await requireApi(env);
  const tree = await api.tree();
  const resolvedAll = local.map(({ target }) =>
    resolveTarget(tree, pullTarget(config, target.file)),
  );

  const cipher = await unlockedVault(await requireVault(api), env, prompt);

  type Stats = { variables: number; added: number; removed: number };
  const pending: { resolved: ResolvedTarget; source: string; plaintext: string; summary: string; stats: Stats }[] = [];
  const results: Record<string, unknown>[] = [];
  // What `sync` measures "edited since" against: every file that now matches
  // the vault, whether it was pushed or already the same.
  const synced: { file: string; versionId: string }[] = [];
  for (const [i, { source, plaintext }] of local.entries()) {
    const resolved = resolvedAll[i]!;
    const { version } = await api.currentVersion(resolved.fileId);
    const stored = version ? await cipher.decrypt(version.blob) : "";

    const shown = path.relative(cwd, source);
    if (version && isUnchanged(stored, plaintext)) {
      done(`${resolved.fileName} is already up to date`);
      synced.push({ file: source, versionId: version.id });
      results.push({ file: resolved.fileName, path: shown, action: "unchanged", variables: countVariables(plaintext), added: 0, removed: 0, version: version.id });
      continue;
    }

    const diff = diffStats(diffLines(stored, plaintext));
    const stats = { variables: countVariables(plaintext), ...diff };
    const summary = describePush({ variableCount: stats.variables, added: diff.added, removed: diff.removed });

    say(
      version
        ? `Push ${style.bold(resolved.fileName)} to ${resolved.workspaceName} / ${resolved.projectName}: ${summary}`
        : `Push ${style.bold(resolved.fileName)} as its first version: ${summary}`,
    );
    const newline = finalNewlineNote(stored, plaintext);
    if (newline) say(`  ${newline}`);
    if (version) say(style.dim("  The version it replaces is kept and can be restored."));
    pending.push({ resolved, source, plaintext, summary, stats });
  }

  if (pending.length === 0) {
    await recordSynced(env, synced);
    emit({ files: results });
    return 0;
  }

  // One question for the whole batch: the summaries above are the thing being
  // confirmed, and asking per file would turn --all back into a chore.
  const question = pending.length === 1 ? "Push?" : `Push ${pending.length} files?`;
  if (!(await confirmOrFail(question, "push", args, ask))) {
    say("Nothing pushed.");
    return 1;
  }

  for (const { resolved, source, plaintext, summary, stats } of pending) {
    const saved = await api.saveVersion(resolved.fileId, await cipher.encrypt(plaintext));
    synced.push({ file: source, versionId: saved.id });
    results.push({ file: resolved.fileName, path: path.relative(cwd, source), action: "pushed", ...stats, version: saved.id });
    done(`Pushed ${summary} to ${resolved.fileName} (version ${saved.id.slice(0, 8)})`);
  }
  await recordSynced(env, synced);
  emit({ files: results });
  return 0;
}
