// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Minimal argv parsing. Pure and dependency-free so it can be tested without
// touching a process — the command surface is small enough that a real parser
// library would be more configuration than code.

export interface ParsedArgs {
  /** The subcommand, or null when none was given. */
  command: string | null;
  /** Everything after the subcommand that isn't a flag. */
  positionals: string[];
  /** `--flag` → true, `--flag=value` or `--flag value` → value. */
  flags: Map<string, string | boolean>;
}

/** Flags that take a value, so `--file .env` consumes the next argument. */
const VALUE_FLAGS = new Set(["file", "path", "project", "workspace", "environment"]);

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();
  let command: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (arg === "--") {
      positionals.push(...argv.slice(i + 1).filter((a): a is string => a !== undefined));
      break;
    }

    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        flags.set(body.slice(0, eq), body.slice(eq + 1));
        continue;
      }
      const next = argv[i + 1];
      if (VALUE_FLAGS.has(body) && next !== undefined && !next.startsWith("-")) {
        flags.set(body, next);
        i++;
      } else {
        flags.set(body, true);
      }
      continue;
    }

    // Short flags are only ever booleans here (-h, -v).
    if (arg.startsWith("-") && arg.length > 1) {
      flags.set(arg.slice(1), true);
      continue;
    }

    if (command === null) command = arg;
    else positionals.push(arg);
  }

  return { command, positionals, flags };
}

/** Read a flag that should carry a string, ignoring a bare `--flag`. */
export function flagValue(args: ParsedArgs, name: string): string | null {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : null;
}

export function hasFlag(args: ParsedArgs, ...names: string[]): boolean {
  return names.some((name) => args.flags.has(name));
}
