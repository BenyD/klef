// SPDX-License-Identifier: AGPL-3.0-or-later

import { homedir } from "node:os";
import path from "node:path";
import { command } from "../invocation.ts";
import { deriveKekBytes } from "../../shared/crypto.ts";
import { bytesToBase64 } from "../../shared/encoding.ts";
import { AUTO_LOCK_DEFAULT_MINUTES, MAX_LOCK_MINUTES } from "../../shared/lock-policy.ts";
import { flagValue, type ParsedArgs } from "../args.ts";
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
import { promptSecret } from "../prompt.ts";
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
  if (process.platform === "win32") {
    console.error("The unlock agent is not available on Windows yet; pull and push will prompt.");
    return 1;
  }

  // Checked before anything else, so a typo costs nothing, not a passphrase.
  const forText = flagValue(args, "for");
  const minutes =
    forText === null ? AUTO_LOCK_DEFAULT_MINUTES : parseLockAfter(forText, MAX_LOCK_MINUTES);
  if (minutes === null) {
    console.error(
      `--for takes a time like 30m, 8h or 7d, up to ${describeLockAfter(MAX_LOCK_MINUTES)}.`,
    );
    return 1;
  }

  const api = await requireApi(env);
  const vault = await api.vault();
  if (!vault.exists || !vault.keyMaterial) {
    console.error("This account has no vault yet. Set one up in the web app first.");
    return 1;
  }
  const { kdfParams, wrappedDek } = vault.keyMaterial;
  const fingerprint = await vaultFingerprint(wrappedDek);

  // Absolute, because the agent runs from "/" and would resolve a relative
  // KLEF_AGENT_SOCK somewhere else entirely.
  const socketPath = path.resolve(agentSocketPath(env, homedir()));
  const running = await agentStatus(socketPath);
  if (running?.fingerprint === fingerprint) {
    console.log(`Already unlocked. Locks in ${describeTimeLeft(running.msLeft)} without use.`);
    if (forText !== null) {
      console.log(`To change that, run \`${command("lock")}\` and unlock again with --for.`);
    }
    return 0;
  }
  // An agent for another vault (a different account or server) holds the one
  // socket; replace it rather than refusing.
  if (running) await lockAgent(socketPath);

  const passphrase = await prompt("Master passphrase: ");
  if (!passphrase) throw new WrongPassphraseError();

  const kekBytes = await deriveKekBytes(passphrase, kdfParams);
  const kek = bytesToBase64(kekBytes);
  kekBytes.fill(0);

  await start({
    kek,
    wrappedDek,
    fingerprint,
    socketPath,
    idleMs: minutes * 60_000,
  });

  console.log(
    `Unlocked. Locks after ${describeLockAfter(minutes)} without use, or on \`${command("lock")}\`.`,
  );
  return 0;
}
