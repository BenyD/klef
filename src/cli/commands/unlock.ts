// SPDX-License-Identifier: MIT

import { homedir } from "node:os";
import path from "node:path";
import { command } from "../invocation.ts";
import { dekBytesWithKekBytes, deriveKekBytes } from "../../shared/crypto.ts";
import { bytesToBase64, type Bytes } from "../../shared/encoding.ts";
import { AUTO_LOCK_DEFAULT_MINUTES, MAX_LOCK_MINUTES } from "../../shared/lock-policy.ts";
import { flagValue, parseArgs, type ParsedArgs } from "../args.ts";
import { loadRememberedKey, rememberEnabled, rememberKey } from "../key-store.ts";
import { requireApi } from "../session.ts";
import { agentSocketPath } from "../paths.ts";
import { agentStatus, lockAgent } from "../agent-client.ts";
import {
  describeLockAfter,
  describeTimeLeft,
  parseLockAfter,
  vaultFingerprint,
} from "../agent-protocol.ts";
import { spawnAgent } from "../agent-spawn.ts";
import type { AgentHandoff } from "../agent.ts";
import { NoTerminalError, promptSecret } from "../prompt.ts";
import { requireVault } from "../common.ts";
import { CliError, cmd, done, emit, note, uiMode } from "../ui.ts";
import { WrongPassphraseError } from "../unlock.ts";

/**
 * Ask for the passphrase once and hand the key to a background agent, so the
 * pulls and pushes that follow reuse it instead of prompting. The agent
 * forgets it after AUTO_LOCK_DEFAULT_MINUTES without use (or `--for`, up to
 * MAX_LOCK_MINUTES), or on `klef lock`.
 *
 * The passphrase is read from the terminal like every other prompt here, so
 * whatever ran this command cannot supply or see it; and what reaches the
 * agent is the derived KEK, over a private channel, never the passphrase.
 */
export async function unlock(
  args: ParsedArgs,
  env: NodeJS.ProcessEnv,
  // Both injectable for tests; production always reads /dev/tty and spawns.
  prompt: (question: string) => Promise<string> = promptSecret,
  start: (handoff: AgentHandoff) => Promise<void> = spawnAgent,
): Promise<number> {

  // Checked before anything else, so a typo costs nothing, not a passphrase.
  const forText = flagValue(args, "for");
  const minutes =
    forText === null ? AUTO_LOCK_DEFAULT_MINUTES : parseLockAfter(forText, MAX_LOCK_MINUTES);
  if (minutes === null) {
    throw new CliError(
      "usage",
      `--for takes a time like 30m, 8h or 7d, up to ${describeLockAfter(MAX_LOCK_MINUTES)}.`,
    );
  }

  const api = await requireApi(env);
  const keyMaterial = await requireVault(api);
  const { kdfParams, wrappedDek } = keyMaterial;
  const fingerprint = await vaultFingerprint(wrappedDek);

  // Remembered on this device already, and no time limit asked for: nothing
  // to do. `--for` asks for a temporary unlock, which the agent gives.
  const remember = forText === null && (await rememberEnabled(env));
  if (remember && (await loadRememberedKey(env, keyMaterial))) {
    done("Already unlocked on this device");
    note(`${cmd(command("lock"), true)} forgets the key here.`);
    emit({ unlocked: true, alreadyUnlocked: true, remembered: true, locksInSeconds: null });
    return 0;
  }

  // Absolute, because the agent runs from "/" and would resolve a relative
  // KLEF_AGENT_SOCK somewhere else entirely.
  const socketPath = path.resolve(agentSocketPath(env, homedir()));
  const running = await agentStatus(socketPath);
  if (running?.fingerprint === fingerprint) {
    done(`Already unlocked. Locks in ${describeTimeLeft(running.msLeft)} without use`);
    if (forText !== null) note(`To change that, run ${cmd(command("lock"), true)} and unlock again with --for.`);
    emit({ unlocked: true, alreadyUnlocked: true, remembered: false, locksInSeconds: Math.floor(running.msLeft / 1000) });
    return 0;
  }
  // An agent for another vault (a different account or server) holds the one
  // socket; replace it rather than refusing.
  if (running) await lockAgent(socketPath);

  if (!uiMode().input) {
    throw new CliError("no_terminal", "Unlocking needs the passphrase typed at a terminal, and prompts are off.", {
      hint: "Run it without --no-input, outside CI, in your own terminal.",
    });
  }
  let passphrase: string;
  try {
    passphrase = await prompt("Master passphrase: ");
  } catch (err) {
    if (!(err instanceof NoTerminalError)) throw err;
    throw new CliError("no_terminal", "Unlocking needs the passphrase typed at a terminal, and there is none here.", {
      hint: "If an agent ran this, ask the user to run it in their own terminal:",
      next: [command("unlock")],
    });
  }
  if (!passphrase) throw new WrongPassphraseError();

  const kekBytes = await deriveKekBytes(passphrase, kdfParams);

  if (remember) {
    let dekBytes: Bytes;
    try {
      dekBytes = await dekBytesWithKekBytes(kekBytes, wrappedDek);
    } catch {
      throw new WrongPassphraseError();
    } finally {
      kekBytes.fill(0);
    }
    const where = await rememberKey(env, keyMaterial, dekBytes);
    dekBytes.fill(0);
    if (where) {
      if (running) await lockAgent(socketPath);
      done("Unlocked on this device");
      note(
        `The key is kept in ${where === "keychain" ? "your OS keychain" : "a private file (0600)"}, so pull, push and sync will not ask again. ${cmd(command("lock"), true)} forgets it.`,
      );
      emit({ unlocked: true, alreadyUnlocked: false, remembered: true, locksInSeconds: null });
      return 0;
    }
    // Nowhere to keep it: fall back to the agent, which needs the KEK again.
    return unlock(parseArgs(["unlock", "--for", "15m"]), env, async () => passphrase, start);
  }

  // The agent path. Remembering works everywhere; the agent is Unix-only.
  if (process.platform === "win32") {
    kekBytes.fill(0);
    throw new CliError("unsupported", "A time-limited unlock needs the unlock agent, which Windows does not have yet.", {
      hint: "Without --for (and with remembering on), unlock keeps the key on this device instead.",
      next: [command("unlock")],
    });
  }
  const kek = bytesToBase64(kekBytes);
  kekBytes.fill(0);

  await start({
    kek,
    wrappedDek,
    fingerprint,
    socketPath,
    idleMs: minutes * 60_000,
  });

  done(`Unlocked. Locks after ${describeLockAfter(minutes)} without use`);
  note(`Lock it sooner with ${cmd(command("lock"), true)}.`);
  emit({ unlocked: true, alreadyUnlocked: false, remembered: false, locksInSeconds: minutes * 60 });
  return 0;
}
