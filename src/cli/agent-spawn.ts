// SPDX-License-Identifier: MIT
//
// Starting the unlock agent from `klef unlock`.
//
// A CryptoKey cannot cross a process boundary, and the DEK is non-extractable
// by design, so the agent has to unwrap it itself. What crosses instead is the
// KEK: the prompting process runs Argon2id, and hands the derived bytes to the
// child over the private IPC channel spawn() opens between the two. Not argv,
// which `ps` shows; not the environment, which the child's children inherit.
// The passphrase never leaves the process that read it from the terminal.

import { spawn } from "node:child_process";
import type { AgentHandoff, AgentHandoffReply } from "./agent.ts";
import { WrongPassphraseError } from "./unlock.ts";

/** The hidden subcommand the detached child runs. Not in `klef help`. */
export const AGENT_COMMAND = "__agent";

/**
 * Spawn a detached agent, give it the KEK, and wait until it is listening.
 * `entry` is the CLI's own script: the source file under `node src/cli`, or
 * the bundle when installed.
 */
export function spawnAgent(
  handoff: AgentHandoff,
  entry: string = process.argv[1] ?? "",
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, AGENT_COMMAND], {
      // Its own session, so closing the terminal that ran `klef unlock` does
      // not take the agent with it, and no terminal to print to.
      detached: true,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      // Holding no directory open, and inheriting nothing it does not need:
      // in particular no NODE_OPTIONS from whatever ran `klef unlock`.
      cwd: "/",
      env: {},
    });

    let settled = false;
    const settle = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (child.connected) child.disconnect();
      child.unref();
      if (err) reject(err);
      else resolve();
    };

    child.on("message", (message) => {
      if (typeof message === "object" && message !== null && "ready" in message) {
        child.send(handoff);
        return;
      }
      const reply = message as AgentHandoffReply;
      if (reply.ok) settle();
      else if (reply.error === "passphrase") settle(new WrongPassphraseError());
      else settle(new Error(reply.error));
    });
    child.once("error", (err) => settle(new Error(`Couldn't start the unlock agent: ${err.message}`)));
    child.once("exit", () => settle(new Error("The unlock agent exited before it started.")));
  });
}
