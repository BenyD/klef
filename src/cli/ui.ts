// SPDX-License-Identifier: MIT
//
// How klef talks: which stream, what colour, and what shape.
//
// - stdout carries the result: human lines, or with `--json` exactly one JSON
//   object, so `klef status --json | jq` always works.
// - stderr carries everything else: errors, warnings, hints, progress.
// - Colour only on a TTY, decided per stream, and never when NO_COLOR,
//   CLICOLOR=0, TERM=dumb or --no-color says not to. FORCE_COLOR forces it.
//
// Nothing here can print a value: every function takes text the caller wrote,
// and errors pass through redactAssignments on the way out as a backstop.

import { redactAssignments } from "./output.ts";

/** The JSON contract's version. Bumped only for a breaking change; new fields are not one. */
export const JSON_SCHEMA = 1;

/** Exit codes, stable across minor versions and listed in `klef help exit-codes`. */
export const EXIT = {
  ok: 0,
  error: 1,
  usage: 2,
  auth: 3,
  locked: 4,
  conflict: 5,
  notFound: 6,
  differs: 10,
  interrupted: 130,
} as const;

/** Error codes in JSON output, a fixed list (see `klef help json`). */
export type ErrorCode =
  | "usage"
  | "confirmation_required"
  | "not_signed_in"
  | "token_rejected"
  | "locked"
  | "no_terminal"
  | "wrong_passphrase"
  | "no_vault"
  | "not_linked"
  | "not_found"
  | "conflict"
  | "unsafe_path"
  | "network"
  | "server"
  | "unsupported"
  | "outdated"
  | "internal";

const EXIT_FOR: Record<ErrorCode, number> = {
  usage: EXIT.usage,
  confirmation_required: EXIT.usage,
  not_signed_in: EXIT.auth,
  token_rejected: EXIT.auth,
  locked: EXIT.locked,
  no_terminal: EXIT.locked,
  wrong_passphrase: EXIT.locked,
  no_vault: EXIT.notFound,
  not_linked: EXIT.notFound,
  not_found: EXIT.notFound,
  conflict: EXIT.conflict,
  unsafe_path: EXIT.usage,
  network: EXIT.error,
  server: EXIT.error,
  unsupported: EXIT.error,
  outdated: EXIT.error,
  internal: EXIT.error,
};

/** A command that moves things forward, runnable as it is, with what it does. */
export interface NextStep {
  command: string;
  description?: string;
}

/**
 * An error a person or an agent can act on: a fixed code, a message, an
 * optional hint in words, and commands that move things forward. `next`
 * commands are built with invocation.ts and never carry a value.
 */
export class CliError extends Error {
  readonly code: ErrorCode;
  readonly hint: string | null;
  readonly next: NextStep[];
  readonly exitCode: number;
  /** What the command found before it stopped, for --json (a conflict's keys, say). */
  readonly data: Record<string, unknown> | null;

  constructor(
    code: ErrorCode,
    message: string,
    options: { hint?: string; next?: (string | NextStep)[]; data?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.code = code;
    this.hint = options.hint ?? null;
    this.next = (options.next ?? []).map((n) => (typeof n === "string" ? { command: n } : n));
    this.exitCode = EXIT_FOR[code];
    this.data = options.data ?? null;
  }
}

export interface UiMode {
  json: boolean;
  quiet: boolean;
  /** Prompts allowed at all: false under --no-input, KLEF_NO_INPUT or CI. */
  input: boolean;
  /** A coding agent is driving, so confirmations need --yes. */
  agent: boolean;
  color: { stdout: boolean; stderr: boolean };
  unicode: boolean;
}

const HUMAN: UiMode = {
  json: false,
  quiet: false,
  input: true,
  agent: false,
  color: { stdout: false, stderr: false },
  unicode: true,
};

let mode: UiMode = HUMAN;
let command = "klef";

export function uiMode(): UiMode {
  return mode;
}

/** Set once per run by index.ts; tests set it directly. */
export function setUiMode(next: Partial<UiMode>, commandName = command): void {
  mode = { ...HUMAN, ...next, color: { ...HUMAN.color, ...next.color } };
  command = commandName;
}

const AGENT_VARS = [
  "AI_AGENT",
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CODEX_SANDBOX",
  "CODEX_THREAD_ID",
  "CURSOR_AGENT",
  "GEMINI_CLI",
  "OPENCODE",
  "AMP_AGENT",
  "AIDER_MODEL",
];

/** A coding agent set its marker variable. Changes presentation and confirmation only. */
export function detectAgent(env: NodeJS.ProcessEnv): boolean {
  return AGENT_VARS.some((name) => {
    const value = env[name];
    return value !== undefined && value !== "" && value !== "0";
  });
}

function truthy(value: string | undefined): boolean {
  return value !== undefined && value !== "" && value !== "0" && value.toLowerCase() !== "false";
}

/** Colour for one stream, by the NO_COLOR / FORCE_COLOR / CLICOLOR conventions. */
export function colorFor(isTty: boolean, env: NodeJS.ProcessEnv, noColorFlag: boolean): boolean {
  if (noColorFlag) return false;
  if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== "0" && env.FORCE_COLOR.toLowerCase() !== "false";
  if (truthy(env.CLICOLOR_FORCE)) return true;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  if (env.CLICOLOR === "0" || env.TERM === "dumb") return false;
  return isTty;
}

/** The mode for a real run, from flags, environment and the process's streams. */
export function modeFor(
  flags: { json: boolean; quiet: boolean; noInput: boolean; noColor: boolean },
  env: NodeJS.ProcessEnv,
  streams: { stdoutTty: boolean; stderrTty: boolean },
): UiMode {
  const locale = `${env.LC_ALL ?? ""}${env.LC_CTYPE ?? ""}${env.LANG ?? ""}`;
  return {
    json: flags.json,
    quiet: flags.quiet,
    input: !(flags.noInput || truthy(env.KLEF_NO_INPUT) || truthy(env.CI)),
    agent: detectAgent(env),
    color: {
      stdout: !flags.json && colorFor(streams.stdoutTty, env, flags.noColor),
      stderr: colorFor(streams.stderrTty, env, flags.noColor),
    },
    unicode: env.TERM !== "dumb" && (locale === "" || /utf-?8/i.test(locale)),
  };
}

const CODES = { bold: [1, 22], dim: [2, 22], red: [31, 39], green: [32, 39], yellow: [33, 39], cyan: [36, 39] };
type Style = keyof typeof CODES;

function paint(on: boolean, style: Style, text: string): string {
  if (!on) return text;
  const [open, close] = CODES[style];
  return `\x1b[${open}m${text}\x1b[${close}m`;
}

/** Styling for text bound for stdout. */
export const style = {
  bold: (t: string) => paint(mode.color.stdout, "bold", t),
  dim: (t: string) => paint(mode.color.stdout, "dim", t),
  green: (t: string) => paint(mode.color.stdout, "green", t),
  yellow: (t: string) => paint(mode.color.stdout, "yellow", t),
  red: (t: string) => paint(mode.color.stdout, "red", t),
  cyan: (t: string) => paint(mode.color.stdout, "cyan", t),
};

function symbol(kind: "ok" | "warn" | "fail", forStderr: boolean): string {
  const on = forStderr ? mode.color.stderr : mode.color.stdout;
  if (kind === "ok") return paint(on, "green", mode.unicode ? "✓" : "ok");
  if (kind === "warn") return paint(on, "yellow", mode.unicode ? "!" : "warn");
  return paint(on, "red", mode.unicode ? "✗" : "error");
}

/** A line of human output on stdout. Silent under --json and --quiet. */
export function say(line = ""): void {
  if (!mode.json && !mode.quiet) console.log(line);
}

/** A finished step, ✓-prefixed. The one human line --quiet still prints. */
export function done(line: string, indent = ""): void {
  if (!mode.json) console.log(`${indent}${symbol("ok", false)} ${line}`);
}

/** A warning on stderr, !-prefixed. Silent under --json (it goes in `warnings`). */
const warnings: { code: string; message: string }[] = [];
export function warn(message: string, code = "warning"): void {
  warnings.push({ code, message });
  if (!mode.json) console.error(`${symbol("warn", true)} ${message}`);
}

/** Supporting detail on stderr: hints, progress, "what happens next". Silent under --json and --quiet. */
export function note(line = ""): void {
  if (!mode.json && !mode.quiet) console.error(line);
}

/** Text in backticks as a runnable command, highlighted on a colour terminal. */
export function cmd(text: string, forStderr = false): string {
  return paint(forStderr ? mode.color.stderr : mode.color.stdout, "cyan", text);
}

let emitted = false;
let depth = 0;

/**
 * Run a command inside another (setup runs login, unlock and pull): its
 * human lines still print, but its JSON result does not, so the outer
 * command's object is the one on stdout.
 */
export async function nested<T>(fn: () => Promise<T>): Promise<T> {
  depth++;
  try {
    return await fn();
  } finally {
    depth--;
  }
}

/** The run's JSON result on stdout. Called once per command; ignored outside --json. */
export function emit(data: Record<string, unknown>): void {
  if (!mode.json || emitted || depth > 0) return;
  emitted = true;
  console.log(
    JSON.stringify({ schema: JSON_SCHEMA, ok: true, command, data, warnings: [...warnings] }, null, 2),
  );
}

/** Print an error the way the mode wants, and return its exit code. */
export function reportError(err: unknown): number {
  const failure = toCliError(err);
  if (mode.json) {
    if (!emitted) {
      emitted = true;
      console.log(
        JSON.stringify(
          {
            schema: JSON_SCHEMA,
            ok: false,
            command,
            error: {
              code: failure.code,
              message: redactAssignments(failure.message),
              hint: failure.hint,
              next: failure.next,
            },
            ...(failure.data ? { data: failure.data } : {}),
            exit: failure.exitCode,
            warnings: [...warnings],
          },
          null,
          2,
        ),
      );
    }
    return failure.exitCode;
  }
  console.error(`${symbol("fail", true)} ${redactAssignments(failure.message)}`);
  if (failure.hint) console.error(`  ${redactAssignments(failure.hint)}`);
  for (const next of failure.next) {
    const why = next.description ? `  ${paint(mode.color.stderr, "dim", `(${next.description})`)}` : "";
    console.error(`  ${paint(mode.color.stderr, "dim", "Run:")} ${cmd(next.command, true)}${why}`);
  }
  return failure.exitCode;
}

/** Anything thrown, as a CliError. Unknown errors keep their message and count as internal. */
export function toCliError(err: unknown): CliError {
  if (err instanceof CliError) return err;
  return new CliError("internal", err instanceof Error ? err.message : String(err));
}

/**
 * Whether a yes/no question may be asked. Never under --json, --no-input, CI
 * or a detected agent: the caller then fails with `confirmation_required`
 * and the exact command to rerun with --yes once the user has said yes.
 */
export function canConfirm(): boolean {
  return mode.input && !mode.json && !mode.agent;
}

/** Forget per-run state. For tests, which run many commands in one process. */
export function resetUi(): void {
  mode = HUMAN;
  command = "klef";
  emitted = false;
  warnings.length = 0;
}
