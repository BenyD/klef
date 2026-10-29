// SPDX-License-Identifier: MIT
//
// Talking to a running unlock agent. Every function here treats "no agent" as
// an ordinary answer rather than an error: a missing socket, or a stale one
// left by an agent that has gone, both mean the vault is locked.

import { command } from "./invocation.ts";
import { CliError } from "./ui.ts";
import { connect } from "node:net";
import path from "node:path";
import {
  encodeFrame,
  MAX_FRAME_BYTES,
  type AgentRequest,
  type AgentResponse,
  type AgentStatus,
} from "./agent-protocol.ts";
import { assertSocketPathFits, checkSocketDir } from "./socket-dir.ts";

/** How long to wait on an agent that accepted a connection but went quiet. */
const RESPONSE_TIMEOUT_MS = 10_000;

/** Errors that mean nobody is listening, as opposed to something broken. */
const NOT_RUNNING = new Set(["ENOENT", "ECONNREFUSED", "ENOTSOCK"]);

export class AgentError extends CliError {
  constructor(message: string) {
    super("locked", message, { next: [command("unlock")] });
  }
}

/**
 * Send one request and wait for its reply. Null when no agent is running.
 */
export async function agentRequest(
  socketPath: string,
  request: AgentRequest,
): Promise<AgentResponse | null> {
  assertSocketPathFits(socketPath);
  if (!(await checkSocketDir(path.dirname(socketPath), false))) return null;

  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    let buffer = "";
    let settled = false;

    const finish = (value: AgentResponse | null, err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(value);
    };

    socket.setEncoding("utf8");
    socket.setTimeout(RESPONSE_TIMEOUT_MS, () =>
      finish(null, new AgentError("The unlock agent stopped responding.")),
    );

    socket.on("connect", () => socket.write(encodeFrame(request)));
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      if (buffer.length > MAX_FRAME_BYTES) {
        finish(null, new AgentError("The unlock agent sent an oversized reply."));
        return;
      }
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      try {
        finish(JSON.parse(buffer.slice(0, newline)) as AgentResponse);
      } catch {
        finish(null, new AgentError("The unlock agent sent a malformed reply."));
      }
    });
    // An agent that hits its deadline closes mid-conversation; to a caller
    // that is the same as it never having been there.
    socket.on("end", () => finish(null));
    socket.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code && NOT_RUNNING.has(err.code)) finish(null);
      else finish(null, new AgentError(`Couldn't reach the unlock agent: ${err.message}`));
    });
  });
}

/** The agent's state, or null when the vault is locked. */
export async function agentStatus(socketPath: string): Promise<AgentStatus | null> {
  const res = await agentRequest(socketPath, { op: "status" });
  return res?.ok && "status" in res ? res.status : null;
}

/** Ask the agent to forget its key and exit. False when none was running. */
export async function lockAgent(socketPath: string): Promise<boolean> {
  return (await agentRequest(socketPath, { op: "lock" })) !== null;
}
