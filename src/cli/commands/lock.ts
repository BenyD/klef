// SPDX-License-Identifier: AGPL-3.0-or-later

import { homedir } from "node:os";
import { agentSocketPath } from "../paths.ts";
import { lockAgent } from "../agent-client.ts";
import { done, emit } from "../ui.ts";

/** Stop the unlock agent, which forgets the key with it. */
export async function lock(env: NodeJS.ProcessEnv): Promise<number> {
  const stopped = await lockAgent(agentSocketPath(env, homedir()));
  done(stopped ? "Locked. The key is gone from memory" : "Already locked");
  emit({ locked: true, wasUnlocked: stopped });
  return 0;
}
