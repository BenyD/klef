// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ParsedArgs } from "../args.ts";
import { findEnvFiles, gitIgnored, scanAgainst } from "../env-scan.ts";
import { command } from "../invocation.ts";
import { readProjectConfig } from "../project-file.ts";
import { cmd, emit, note, say, style, warn } from "../ui.ts";
import { shellArg } from "../common.ts";

/**
 * List the env files in this checkout that `.klef.json` does not cover, so a
 * monorepo app's own .env.local is not quietly left out of sync. Files git
 * does not ignore are called out: they could be committed. Names and paths
 * only, read-only.
 */
export async function scan(_args: ParsedArgs, env: NodeJS.ProcessEnv, cwd: string): Promise<number> {
  const config = await readProjectConfig(cwd);
  const found = await findEnvFiles(cwd);
  const ignored = await gitIgnored(cwd, found, env);
  const result = scanAgainst(config, found, ignored);
  emit({ linked: config !== null, gitRepository: ignored !== null, ...result });

  if (result.unlisted.length === 0) {
    say(found.length ? "Every env file here is listed in .klef.json." : "No env files here.");
    return 0;
  }
  const width = Math.max(...result.unlisted.map((u) => u.path.length));
  say("Env files here that .klef.json does not list:");
  for (const u of result.unlisted) {
    const tag = u.ignored === null ? "" : u.ignored ? style.dim("ignored by git") : style.yellow("NOT ignored by git");
    say(`  ${u.path.padEnd(width)}  ${tag}`.trimEnd());
  }
  if (result.unlisted.some((u) => u.ignored === false)) {
    warn("A file git does not ignore can be committed with every value in it. Add it to .gitignore.");
  }
  const first = result.unlisted[0]!.path;
  note(
    config
      ? `Add one with ${cmd(command(`link --add ${shellArg(first)}`), true)}`
      : `Link this checkout first with ${cmd(command("setup"), true)}`,
  );
  return 0;
}
