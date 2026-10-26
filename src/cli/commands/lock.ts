// SPDX-License-Identifier: AGPL-3.0-or-later

import { homedir } from "node:os";
import { agentSocketPath } from "../paths.ts";
import { lockAgent } from "../agent-client.ts";

/** Stop the unlock agent, which forgets the key with it. */
export async function lock(env: NodeJS.ProcessEnv): Promise<number> {
  const stopped = await lockAgent(agentSocketPath(env, homedir()));
  console.log(stopped ? "Locked." : "Already locked.");
  return 0;
}
