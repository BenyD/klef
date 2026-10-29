// SPDX-License-Identifier: MIT

import path from "node:path";
import { requireApi } from "../session.ts";
import { requireConfig, requireVault, unlockedVault } from "../common.ts";
import { emit, EXIT, say, style } from "../ui.ts";
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
 * Exits 0 whether or not anything differs, unless --exit-code asks for 10
 * on a difference: differences are the answer here, not a failure.
 */
export async function diff(
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
  const cipher = await unlockedVault(await requireVault(api), env, prompt);

  const entries = targets.map((t) => ({ file: t.file, path: t.path ?? t.file }));
  const files = await inspectProject({ api, tree, cipher, env }, cwd, config, entries);

  let differs = false;
  const out: Record<string, unknown>[] = [];
  for (const file of files) {
    const shown = path.relative(cwd, file.destination);
    const keys = file.local && file.vault ? keyDiff(file.local.text, file.vault.text) : null;
    const same = file.decision.action === "in-sync" || file.decision.action === "absent";
    if (!same) differs = true;
    say(`${style.bold(shown)}  ${same ? style.dim(file.decision.reason) : file.decision.reason}`);
    if (keys) for (const line of formatKeyDiff(keys, file.local!.text, file.vault!.text)) say(line);
    out.push({
      file: file.entry.file,
      path: shown,
      state: file.decision.action,
      reason: file.decision.reason,
      onlyLocal: keys?.onlyLocal ?? [],
      onlyVault: keys?.onlyVault ?? [],
      changed: keys?.changed ?? [],
      declaredUnsetLocal: keys?.declaredLocal ?? [],
      declaredUnsetVault: keys?.declaredVault ?? [],
    });
  }
  emit({ files: out });
  return differs && hasFlag(args, "exit-code") ? EXIT.differs : EXIT.ok;
}
