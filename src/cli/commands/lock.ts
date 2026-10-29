// SPDX-License-Identifier: MIT

import { homedir } from "node:os";
import { agentSocketPath } from "../paths.ts";
import { lockAgent } from "../agent-client.ts";
import { done, emit } from "../ui.ts";
import { forgetKey } from "../key-store.ts";

/**
 * Lock this device: stop the unlock agent, which forgets the key with it, and
 * forget the key remembered in the keychain or key file. After this, every
 * command asks for the passphrase until the next unlock or browser sign-in.
 */
export async function lock(env: NodeJS.ProcessEnv): Promise<number> {
  const stopped = await lockAgent(agentSocketPath(env, homedir()));
  const forgotten = await forgetKey(env);
  done(
    forgotten
      ? "Locked. The key is forgotten on this device"
      : stopped
        ? "Locked. The key is gone from memory"
        : "Already locked",
  );
  emit({ locked: true, wasUnlocked: stopped || forgotten });
  return 0;
}
