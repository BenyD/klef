// SPDX-License-Identifier: MIT
//
// Telling someone a newer klef is out, the way Homebrew does: after a
// command, at most once a day, one line on stderr. The rules are the kit
// notice's (commands/kit.ts): never under --json, --quiet, a coding agent,
// --no-input or without a terminal, never slower than a second and a half,
// and silent on any failure. The only thing it asks anyone is npm's registry,
// for the newest version number, and KLEF_NO_UPDATE_CHECK turns it off.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { compareVersions, isKitVersion, updateCheckDue } from "./kit-lib.ts";
import { invocationName } from "./invocation.ts";
import { configDir } from "./paths.ts";
import { note, uiMode } from "./ui.ts";
import { CLI_VERSION } from "./version.ts";

const LATEST_URL = "https://registry.npmjs.org/@klefsh%2fcli/latest";

/**
 * The line to print when `latest` is newer than `current`, or null. How to
 * get it depends on how klef was run: npx can be told to fetch the newest,
 * a global install has to be updated.
 */
export function cliUpdateLine(current: string, latest: string | null, invokedAs: string): string | null {
  if (!latest || !isKitVersion(latest) || compareVersions(latest, current) <= 0) return null;
  const how = invokedAs.startsWith("npx") ? "npx @klefsh/cli@latest runs it" : "update with npm install -g @klefsh/cli";
  return `klef ${latest} is out (you have ${current}); ${how}.`;
}

export async function cliUpdateNotice(env: NodeJS.ProcessEnv): Promise<void> {
  const mode = uiMode();
  if (mode.json || mode.quiet || mode.agent || !mode.input || process.stderr.isTTY !== true) return;
  if (env.KLEF_NO_UPDATE_CHECK && env.KLEF_NO_UPDATE_CHECK !== "0") return;
  const dir = configDir(env, homedir());
  const stamp = path.join(dir, ".cli-last-check");
  const last = existsSync(stamp) ? readFileSync(stamp, "utf8").trim() : null;
  if (!updateCheckDue(last, Date.now())) return;
  try {
    const res = await fetch(LATEST_URL, { signal: AbortSignal.timeout(1500) });
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(stamp, `${new Date().toISOString()}\n`, { mode: 0o600 });
    const version = res.ok ? ((await res.json()) as { version?: unknown }).version : null;
    const line = cliUpdateLine(CLI_VERSION, typeof version === "string" ? version : null, invocationName());
    if (line) note(`\n${line}`);
  } catch {
    // Offline, slow, or anything else: say nothing.
  }
}
