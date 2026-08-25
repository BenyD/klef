#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Entry point. Dispatch, and the one place errors become exit codes.

import { parseArgs, hasFlag } from "./args.ts";
import { HELP } from "./help.ts";
import { login } from "./commands/login.ts";
import { logout } from "./commands/logout.ts";
import { status } from "./commands/status.ts";
import { link } from "./commands/link.ts";
import { pull } from "./commands/pull.ts";
import { push } from "./commands/push.ts";
import { CLI_VERSION } from "./version.ts";
import { redactAssignments } from "./output.ts";



async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const env = process.env;
  const cwd = process.cwd();

  if (hasFlag(args, "v", "version")) {
    console.log(CLI_VERSION);
    return 0;
  }

  if (args.command === null || args.command === "help" || hasFlag(args, "h", "help")) {
    console.log(HELP);
    return args.command === null ? 1 : 0;
  }

  switch (args.command) {
    case "login":
      return login(args, env);
    case "logout":
      return logout(env);
    case "status":
      return status(env, cwd);
    case "link":
      return link(args, env, cwd);
    case "pull":
      return pull(args, env, cwd);
    case "push":
      return push(args, env, cwd);
    default:
      console.error(`Unknown command "${args.command}". Try \`klef help\`.`);
      return 1;
  }
}

try {
  process.exitCode = await main();
} catch (err) {
  // Errors reach the user as one line. Stack traces are noise here, and a
  // stack could carry values a message wouldn't.
  //
  // Redacted on the way out as a backstop: nothing is supposed to put an env
  // line in an error, but this is the last place a message crosses into a
  // terminal, and "no value is ever printed" should not rest on every future
  // error string being careful.
  console.error(redactAssignments(err instanceof Error ? err.message : String(err)));
  process.exitCode = 1;
}
