// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The checks most commands start with, failing the same way everywhere: as a
// CliError with a code, an exit status and the command that moves things on.

import { command } from "./invocation.ts";
import type { KlefApi } from "./api.ts";
import type { ParsedArgs } from "./args.ts";
import { CONFIG_FILENAME, type ProjectConfig } from "./project-config.ts";
import { readProjectConfig } from "./project-file.ts";
import { NoTerminalError } from "./prompt.ts";
import { shellQuote } from "../shared/shell.ts";
import type { VaultKeyMaterial } from "../shared/types.ts";
import { canConfirm, CliError } from "./ui.ts";
import { openVault, type VaultCipher } from "./vault-key.ts";

/** `.klef.json` here, or a not_linked error that says how to link. */
export async function requireConfig(cwd: string): Promise<ProjectConfig> {
  const config = await readProjectConfig(cwd);
  if (!config) {
    throw new CliError("not_linked", `No ${CONFIG_FILENAME} here, so this directory is not linked.`, {
      next: [command("link"), command("setup")],
    });
  }
  return config;
}

/** The account's key material, or a no_vault error. */
export async function requireVault(api: KlefApi): Promise<VaultKeyMaterial> {
  const vault = await api.vault();
  if (!vault.exists || !vault.keyMaterial) {
    throw new CliError("no_vault", "This account has no vault yet.", {
      hint: "Set one up in the web app first.",
    });
  }
  return vault.keyMaterial;
}

/**
 * Open the vault through the unlock agent, or by asking for the passphrase.
 * With no terminal to ask on (an agent, CI, a pipe), the answer is `locked`
 * and the ways out: a sign-in the user approves in the browser, which unlocks
 * this device too, or `klef unlock` typed by the user at their own terminal.
 */
export async function unlockedVault(
  keyMaterial: VaultKeyMaterial,
  env: NodeJS.ProcessEnv,
  prompt?: (question: string) => Promise<string>,
): Promise<VaultCipher> {
  try {
    return await openVault(keyMaterial, env, prompt);
  } catch (err) {
    if (!(err instanceof NoTerminalError)) throw err;
    throw new CliError("locked", "The vault is locked on this device, and unlocking it needs the user.", {
      hint: "Run klef login and have the user approve it in the browser (one passkey touch), or ask them to run klef unlock:",
      next: [{ command: command("login"), description: "the user approves in the browser, which unlocks this device" }, { command: command("unlock"), description: "or the user types the passphrase in their own terminal" }],
    });
  }
}

/** A shell argument, quoted only when the shell would split or expand it. */
export function shellArg(value: string): string {
  return /^[\w.@%+=:,/-]+$/.test(value) ? value : shellQuote(value);
}

/** This invocation again, with `extra` flags added, for a `next` command. */
export function rerun(name: string, args: ParsedArgs, extra: string[] = []): string {
  const parts = [name, ...args.positionals.map(shellArg)];
  for (const [flag, value] of args.flags) {
    if (extra.includes(`--${flag}`)) continue;
    parts.push(value === true ? `--${flag}` : `--${flag} ${shellArg(String(value))}`);
  }
  return command([...parts, ...extra].join(" "));
}

/**
 * A yes before something that writes. `--yes` answers it. Where no one can
 * answer (no terminal, --json, --no-input, CI, a coding agent), this fails
 * with confirmation_required and the command to rerun once the user has said
 * yes, rather than hanging on a prompt nobody will see.
 */
export async function confirmOrFail(
  question: string,
  name: string,
  args: ParsedArgs,
  ask: (question: string) => Promise<boolean>,
): Promise<boolean> {
  if (args.flags.has("yes")) return true;
  const needYes = new CliError("confirmation_required", `${command(name)} needs a yes before it changes anything.`, {
    hint: "Nobody can answer here. Ask the user, then rerun with --yes:",
    next: [rerun(name, args, ["--yes"])],
  });
  if (!canConfirm()) throw needYes;
  try {
    return await ask(question);
  } catch (err) {
    if (err instanceof NoTerminalError) throw needYes;
    throw err;
  }
}
