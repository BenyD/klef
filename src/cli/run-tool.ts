// SPDX-License-Identifier: MIT
//
// Running the user's own `vercel`, `gh` and `wrangler`, for `audit`. Klef
// holds no token for any of them: each tool uses its own sign-in.
//
// Output is captured, never passed through. A Vercel listing carries the
// values of variables that are not Sensitive, so stdout is parsed in memory
// for names and nothing else, and on failure only a scrubbed line of stderr
// is shown.

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
  options: { cwd: string; env: NodeJS.ProcessEnv },
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
    // Nothing to send: a closed stdin stops a tool waiting on a prompt.
    child.stdin.on("error", () => {});
    child.stdin.end();
  });
}

/**
 * The last meaningful line of a failed tool's stderr, which is where "not
 * signed in" and "not linked" are said. Never stdout, which for a listing can
 * hold readable values; and any `NAME=value` in it is redacted anyway.
 */
export function failureLine(result: ToolResult): string {
  const text = result.stderr.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
  // Mid-line too: a tool's message can quote `NAME=value` anywhere in a line.
  // Upper-case names only there, so a URL's `?per_page=100` survives.
  const lines = redactAssignments(text)
    .replace(/\b([A-Z_][A-Z0-9_]*=)\S+/g, "$1<redacted>")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1) ?? `exit ${result.code}`;
}
