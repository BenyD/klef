#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Entry point. Dispatch, and the one place errors become exit codes.

import { realpathSync, statSync } from "node:fs";
import path from "node:path";
import { parseArgs, hasFlag, flagValue, type ParsedArgs } from "./args.ts";
import {
  commandHelp,
  completionScript,
  COMMANDS,
  findCommand,
  rootHelp,
  suggest,
  topicHelp,
  TOPICS,
  unknownFlag,
} from "./commands-table.ts";
import { login } from "./commands/login.ts";
import { logout } from "./commands/logout.ts";
import { status } from "./commands/status.ts";
import { link } from "./commands/link.ts";
import { list } from "./commands/list.ts";
import { pull } from "./commands/pull.ts";
import { push } from "./commands/push.ts";
import { unlock } from "./commands/unlock.ts";
import { lock } from "./commands/lock.ts";
import { audit } from "./commands/audit.ts";
import { sync } from "./commands/sync.ts";
import { diff } from "./commands/diff.ts";
import { restore } from "./commands/restore.ts";
import { setup, defaultSetupDeps } from "./commands/setup.ts";
import { set } from "./commands/set.ts";
import { recover } from "./commands/recover.ts";
import { run } from "./commands/run.ts";
import { AGENT_COMMAND } from "./agent-spawn.ts";
import { runAgentProcess } from "./agent.ts";
import { CLI_VERSION } from "./version.ts";
import { command as suggested, invocationName } from "./invocation.ts";
import { CliError, emit, EXIT, modeFor, reportError, setUiMode, uiMode } from "./ui.ts";

type Run = (args: ParsedArgs, env: NodeJS.ProcessEnv, cwd: string) => Promise<number>;

const RUN: Record<string, Run> = {
  setup: (args, env, cwd) => setup(args, cwd, defaultSetupDeps(args, env, cwd)),
  login: (args, env) => login(args, env),
  logout: (_args, env) => logout(env),
  status: (args, env, cwd) => status(args, env, cwd),
  link: (args, env, cwd) => link(args, env, cwd),
  list: (args, env, cwd) => list(args, env, cwd),
  set: (args, env, cwd) => set(args, env, cwd),
  recover: (args, env, cwd) => recover(args, env, cwd),
  pull: (args, env, cwd) => pull(args, env, cwd),
  push: (args, env, cwd) => push(args, env, cwd),
  sync: (args, env, cwd) => sync(args, env, cwd),
  diff: (args, env, cwd) => diff(args, env, cwd),
  audit: (args, env, cwd) => audit(args, env, cwd),
  restore: (args, env, cwd) => restore(args, env, cwd),
  unlock: (args, env) => unlock(args, env),
  lock: (_args, env) => lock(env),
  run: (args, env, cwd) => run(args, env, cwd),
};

function resolveCwd(args: ParsedArgs): string {
  const dir = flagValue(args, "cwd");
  if (dir === null) {
    if (hasFlag(args, "cwd")) throw new CliError("usage", "--cwd needs a directory.");
    return process.cwd();
  }
  const resolved = path.resolve(dir);
  let isDir = false;
  try {
    isDir = statSync(resolved).isDirectory();
  } catch {
    // Reported below.
  }
  if (!isDir) throw new CliError("usage", `--cwd: ${dir} is not a directory.`);
  // The real path, as process.cwd() would give, so sync records match.
  return realpathSync(resolved);
}

function help(args: ParsedArgs): number {
  const cli = invocationName();
  const topic = args.command === "help" ? args.positionals[0] : args.command;
  if (!topic) {
    console.log(rootHelp(cli, CLI_VERSION));
    return EXIT.ok;
  }
  if ((TOPICS as readonly string[]).includes(topic)) {
    console.log(topicHelp(topic as (typeof TOPICS)[number], cli));
    return EXIT.ok;
  }
  const spec = findCommand(topic);
  if (!spec) throw unknownCommand(topic);
  console.log(commandHelp(spec, cli));
  return EXIT.ok;
}

function unknownCommand(name: string): CliError {
  const names = COMMANDS.filter((c) => !c.hidden).flatMap((c) => [c.name, ...(c.aliases ?? [])]);
  const guess = suggest(name, names);
  return new CliError("usage", `Unknown command "${name}".${guess ? ` Did you mean "${guess}"?` : ""}`, {
    next: [suggested("help")],
  });
}

async function main(args: ParsedArgs): Promise<number> {
  const env = process.env;

  if (hasFlag(args, "version") && (args.command === null || !hasFlag(args, "help"))) {
    if (uiMode().json) emit({ version: CLI_VERSION });
    else console.log(CLI_VERSION);
    return EXIT.ok;
  }
  if (args.command === null || args.command === "help" || hasFlag(args, "help")) return help(args);

  const spec = findCommand(args.command);
  if (!spec) throw unknownCommand(args.command);

  const bad = unknownFlag(spec, args.flags.keys());
  if (bad) {
    const shown = bad.flag.length === 1 ? `-${bad.flag}` : `--${bad.flag}`;
    throw new CliError(
      "usage",
      `Unknown flag ${shown} for ${spec.name}.${bad.suggestion ? ` Did you mean --${bad.suggestion}?` : ""}`,
      {
        hint: spec.name === "run" ? "Put the command to run after --, so its flags are its own:" : undefined,
        next: [suggested(spec.name === "run" ? "run -- <command> [args...]" : `help ${spec.name}`)],
      },
    );
  }

  if (spec.name === "completion") {
    const shell = args.positionals[0];
    if (shell !== "bash" && shell !== "zsh" && shell !== "fish") {
      throw new CliError("usage", "Say which shell: bash, zsh or fish.", { next: [suggested("completion zsh")] });
    }
    process.stdout.write(completionScript(shell));
    return EXIT.ok;
  }

  return RUN[spec.name]!(args, env, resolveCwd(args));
}

const args = parseArgs(process.argv.slice(2));

if (args.command === AGENT_COMMAND) {
  // The unlock agent's own process: no CLI surface at all.
  process.exitCode = await runAgentProcess();
} else {
  setUiMode(
    modeFor(
      {
        json: hasFlag(args, "json"),
        quiet: hasFlag(args, "quiet"),
        noInput: hasFlag(args, "no-input"),
        noColor: hasFlag(args, "no-color"),
      },
      process.env,
      { stdoutTty: process.stdout.isTTY === true, stderrTty: process.stderr.isTTY === true },
    ),
    findCommand(args.command ?? "")?.name ?? args.command ?? "klef",
  );
  try {
    process.exitCode = await main(args);
  } catch (err) {
    // Errors reach the user as one line plus a next step. Stack traces are
    // noise here, and a stack could carry values a message wouldn't. The
    // message is redacted on the way out as a backstop (see ui.ts).
    process.exitCode = reportError(err);
  }
}
