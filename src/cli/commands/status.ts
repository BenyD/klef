// SPDX-License-Identifier: AGPL-3.0-or-later

import { command } from "../invocation.ts";
import { KlefApi, UnauthorizedError } from "../api.ts";
import { loadToken } from "../credentials.ts";
import { apiBaseUrl } from "../paths.ts";
import { readProjectConfig } from "../project-file.ts";
import { CONFIG_FILENAME } from "../project-config.ts";
import { hasFlag, type ParsedArgs } from "../args.ts";
import { homedir } from "node:os";
import { agentSocketPath } from "../paths.ts";
import { agentStatus } from "../agent-client.ts";
import { describeTimeLeft, type AgentStatus } from "../agent-protocol.ts";

const SOURCE_LABEL = {
  keychain: "OS keychain",
  file: "config file",
  environment: "KLEF_TOKEN",
} as const;

/** Why we are or aren't signed in, kept separate from how it is phrased. */
type TokenStatus = "valid" | "rejected" | "unverified" | "absent";

export async function status(
  args: ParsedArgs,
  env: NodeJS.ProcessEnv,
  cwd: string,
): Promise<number> {
  const base = apiBaseUrl(env);
  const stored = await loadToken(env);

  let tokenStatus: TokenStatus = stored ? "unverified" : "absent";
  let email: string | null = null;

  if (stored) {
    try {
      const { user } = await new KlefApi(base, stored.token).whoami();
      email = user.email;
      tokenStatus = "valid";
    } catch (err) {
      tokenStatus = err instanceof UnauthorizedError ? "rejected" : "unverified";
    }
  }

  const config = await readProjectConfig(cwd);

  // Locked or not is a question for the local agent alone; it needs neither
  // the network nor the passphrase. A socket directory that fails its safety
  // check is reported rather than thrown, so status still says everything else.
  let agent: AgentStatus | null = null;
  let agentProblem: string | null = null;
  try {
    agent = await agentStatus(agentSocketPath(env, homedir()));
  } catch (err) {
    agentProblem = err instanceof Error ? err.message : String(err);
  }

  // Structured first: a caller that asked for JSON gets JSON and nothing else
  // on stdout, so the output stays parseable without stripping prose.
  if (hasFlag(args, "json")) {
    console.log(
      JSON.stringify(
        {
          server: base,
          signedIn: tokenStatus === "valid",
          tokenStatus,
          tokenSource: stored?.source ?? null,
          email,
          linked: config ?? null,
          unlocked: agent !== null,
          lockInSeconds: agent ? Math.floor(agent.msLeft / 1000) : null,
          agentProblem,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log(`Server:  ${base}`);

  if (!stored) {
    console.log(`Signed in: no (run \`${command("login")}\`)`);
  } else if (tokenStatus === "valid") {
    console.log(`Signed in: ${email} (token from ${SOURCE_LABEL[stored.source]})`);
  } else {
    console.log(`Signed in: token ${tokenStatus} (from ${SOURCE_LABEL[stored.source]})`);
  }

  if (!config) {
    console.log(`Linked:    no ${CONFIG_FILENAME} here (run \`${command("link")}\`)`);
  } else {
    const label = config.environment ? ` (${config.environment})` : "";
    console.log(
      `Linked:    ${config.workspace} / ${config.project} / ${config.file}${label}`,
    );
  }

  if (agent) {
    console.log(`Vault:     unlocked (locks in ${describeTimeLeft(agent.msLeft)} without use)`);
  } else if (agentProblem) {
    console.log(`Vault:     locked (${agentProblem})`);
  } else {
    console.log(`Vault:     locked (pull and push will ask for the passphrase; \`${command("unlock")}\` to ask once)`);
  }

  return 0;
}
