// SPDX-License-Identifier: MIT

import { readFile } from "node:fs/promises";
import { flagValue, hasFlag, type ParsedArgs } from "../args.ts";
import { parseLockAfter } from "../agent-protocol.ts";
import { requireConfig, requireVault, unlockedVault } from "../common.ts";
import { openBrowser } from "../device-login.ts";
import { command } from "../invocation.ts";
import { apiBaseUrl } from "../paths.ts";
import { requireAccess, resolveTarget } from "../resolve.ts";
import { requireApi } from "../session.ts";
import { rawValueOf } from "../set-key.ts";
import { recordSynced } from "../sync-state.ts";
import { cmd, CliError, done, emit, note, say, style, uiMode } from "../ui.ts";
import { pullTarget } from "./pull.ts";
import { localTarget, writeKey } from "./set.ts";
import { askAnswered, askLinkPath, cleanAskReason, isAskName } from "../../shared/ask-link.ts";
import { vaultFiles } from "../vault-files.ts";

/** How long `ask` waits by default, and at most. */
export const ASK_TIMEOUT_MINUTES = 15;

/** How often it looks at the vault while it waits. */
const POLL_MS = 3000;

/** What `ask` reaches outside itself for; tests stand these in. */
export interface AskDeps {
  open: (url: string) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  prompt?: (question: string) => Promise<string>;
}

export const defaultAskDeps: AskDeps = {
  open: openBrowser,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: Date.now,
};

/**
 * Ask the user for a secret this directory needs, without it passing through
 * whatever ran klef.
 *
 * Built for coding agents: an agent that needs STRIPE_SECRET_KEY runs this
 * instead of asking the user to paste the key into chat. klef opens the
 * vault file in the web app with the key ready to fill in; the user types the
 * value and saves, as they would any edit. klef watches the vault, and once a
 * saved version gives the key a value, sets that one key in the local file
 * (the same edit `klef set` makes) and exits 0. The value is never printed.
 *
 * Reading the saved version takes the vault key, so this needs the device
 * unlocked, which the agent needs anyway to use the value with `klef run`.
 */
export async function ask(
  args: ParsedArgs,
  env: NodeJS.ProcessEnv,
  cwd: string,
  deps: AskDeps = defaultAskDeps,
): Promise<number> {
  const name = args.positionals[0];
  if (!name || args.positionals.length > 1) {
    throw new CliError("usage", "Name one variable; the user enters the value in the browser.", {
      next: [command('ask API_KEY --reason "what it is for"')],
    });
  }
  if (!isAskName(name)) throw new CliError("usage", `"${name}" is not a variable name.`);

  const timeoutText = flagValue(args, "timeout");
  const minutes =
    timeoutText === null ? ASK_TIMEOUT_MINUTES : parseLockAfter(timeoutText, ASK_TIMEOUT_MINUTES);
  if (minutes === null) {
    throw new CliError("usage", `--timeout takes a time like 5m, up to ${ASK_TIMEOUT_MINUTES}m.`);
  }
  const reasonFlag = flagValue(args, "reason");
  if (hasFlag(args, "reason") && reasonFlag === null) throw new CliError("usage", "--reason needs some words.");
  const reason = cleanAskReason(reasonFlag);

  const config = await requireConfig(cwd);
  const target = localTarget(config, flagValue(args, "file"), cwd);
  const api = await requireApi(env);
  const tree = await api.tree();
  const resolved = requireAccess(resolveTarget(tree, pullTarget(config, target.file)));
  // Before anything opens: if the vault is locked here, say so now, not
  // after the user has typed the value.
  const cipher = await unlockedVault(await requireVault(api), env, deps.prompt);
  const files = vaultFiles(api, tree, cipher);

  const start = await api.currentVersion(resolved.fileId);
  const before = start.version ? rawValueOf(await files.decrypt(start.version), name) : null;

  const url = `${apiBaseUrl(env)}${askLinkPath({ fileId: resolved.fileId, name, reason })}`;
  // On stderr even under --json: the person has to see it while this waits,
  // and an agent relays it if the browser did not open.
  if (uiMode().json || uiMode().quiet) console.error(`Set ${name} in your browser: ${url}`);
  else {
    say(`${style.bold(name)} is needed${reason ? ` (${reason})` : ""}.`);
    say(`Set it in your browser, not in chat: ${style.cyan(url)}`);
    say(style.dim(`  Waiting up to ${minutes} minutes for it to be saved to ${resolved.fileName}...`));
  }
  if (!hasFlag(args, "no-open")) deps.open(url);

  // Wait for a saved version that gives the key a value (a new one, if it
  // had one before).
  const deadline = deps.now() + minutes * 60_000;
  let seen = start.version?.id ?? null;
  let found: { versionId: string; text: string; raw: string } | null = null;
  while (!found && deps.now() < deadline) {
    await deps.sleep(POLL_MS);
    const { version } = await api.currentVersion(resolved.fileId);
    if (!version || version.id === seen) continue;
    seen = version.id;
    const text = await files.decrypt(version);
    const raw = rawValueOf(text, name);
    if (raw !== null && askAnswered(text, name) && raw !== before) found = { versionId: version.id, text, raw };
  }
  if (!found) {
    throw new CliError("timed_out", `${name} wasn't saved in time. Nothing was written here.`, {
      hint: "Check with the user, then ask again. Don't ask for the value in chat.",
      next: [command(`ask ${name}`)],
    });
  }

  // A local file that isn't here is left alone: creating one with just this
  // key would look like a file that lost the rest. `pull` writes the whole one.
  const local = await readFile(target.absolute, "utf8").catch(() => null);
  let added: boolean | null = null;
  if (local !== null) {
    added = (await writeKey(target.absolute, name, found.raw)).added;
    // Matching the vault byte for byte is matching it: record that, so
    // `status` and `sync` read the file as in sync.
    if ((await readFile(target.absolute, "utf8")) === found.text) {
      await recordSynced(env, [{ file: target.absolute, versionId: found.versionId }]);
    }
    done(`${name} is set in the vault and in ${target.shown}`);
  } else {
    done(`${name} is set in the vault (${resolved.fileName})`);
    note(`${target.shown} isn't here, so it was left alone. ${cmd(command("pull"), true)} writes it.`);
  }
  note(`Use it without reading it: ${cmd(command("run -- <command>"), true)}`);
  emit({
    name,
    file: target.file,
    path: target.shown,
    local: local !== null ? "written" : "skipped",
    added,
    version: found.versionId,
  });
  return 0;
}
