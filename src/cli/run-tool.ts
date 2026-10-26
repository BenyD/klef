// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Running the user's own `vercel`, `gh` and `wrangler`. Klef holds no token
// for any of them: each tool uses its own sign-in, and klef only hands it
// values.
//
// Values travel on stdin, never in argv, which every process on the machine
// can read through `ps`. Output is captured, never passed through: it is
// parsed, or on failure reduced to a line with every value scrubbed out.

import { spawn } from "node:child_process";
import { redactAssignments } from "./output.ts";

export interface ToolResult {
  code: number;
  stdout: string;
  stderr: string;
}

export class ToolError extends Error {}

export async function runTool(
  cmd: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; input?: string },
): Promise<ToolResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.on("error", (err) => {
      if ("code" in err && err.code === "ENOENT") {
        reject(new ToolError(`\`${cmd}\` is not installed, or not on PATH.`));
      } else {
        reject(err);
      }
    });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    // A tool that exits without reading its input must not crash us with EPIPE.
    child.stdin.on("error", () => {});
    child.stdin.end(options.input ?? "");
  });
}

/**
 * The last meaningful line of a failed tool's stderr, with every value klef
 * sent replaced. Never stdout, which for a listing can hold readable values.
 * Tools rarely echo input on stderr, but this is about to reach a terminal,
 * and "rarely" is not "never".
 */
export function failureLine(result: ToolResult, values: Iterable<string> = []): string {
  let text = result.stderr.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
  // Longest first, so a value that contains another is scrubbed whole.
  for (const value of [...values].filter((v) => v.length >= 4).sort((a, b) => b.length - a.length)) {
    text = text.split(value).join("<redacted>");
  }
  const lines = redactAssignments(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1) ?? `exit ${result.code}`;
}
