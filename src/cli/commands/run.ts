// SPDX-License-Identifier: MIT

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { constants as osConstants } from "node:os";
import { StringDecoder } from "node:string_decoder";
import { flagValue, hasFlag, type ParsedArgs } from "../args.ts";
import { requireConfig, requireVault, unlockedVault } from "../common.ts";
import { envEntries } from "../dotenv-values.ts";
import { command } from "../invocation.ts";
import type { ProjectConfig } from "../project-config.ts";
import { createRedactor, REDACTED, redactable } from "../redact.ts";
import { resolveTarget } from "../resolve.ts";
import { requireApi } from "../session.ts";
import { syncTargets } from "../targets.ts";
import { CliError, emit, note, uiMode, warn } from "../ui.ts";
import { resolveWritePath } from "../write-path.ts";

/**
 * How long a partial line is held before it is forwarded anyway. A prompt
 * with no newline after it ("Password: ") would otherwise never show. A
 * value split across two pipe reads arrives in one go, long before this.
 */
const IDLE_FLUSH_MS = 100;

/** What the command touches outside the files, replaceable in tests. */
export interface RunDeps {
  /** Where the child's forwarded output goes. */
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** Where SIGTERM and SIGHUP arrive, to pass on to the child. */
  signals: Pick<NodeJS.EventEmitter, "on" | "off">;
}

export function defaultRunDeps(): RunDeps {
  return {
    stdout: (text) => void process.stdout.write(text),
    stderr: (text) => void process.stderr.write(text),
    signals: process,
  };
}

/** One file's variables, and where they came from. */
interface Loaded {
  file: string;
  source: "local" | "vault";
  values: Map<string, string>;
}

/**
 * Run a command with an env file's variables in its environment, so nothing
 * (and no agent) has to open the file to use what is in it: starting the
 * app, running the tests, pointing a one-off query at DATABASE_URL.
 *
 * The local file is read by default, which needs no unlock; `--from-vault`
 * decrypts the vault's copy in memory instead, so nothing need be on disk.
 * `--all` merges every file `.klef.json` lists, a later file winning a
 * shared key; `--only` passes just the named keys. The file wins over a
 * variable already set in the environment.
 *
 * klef itself prints no value, and the command's stdout and stderr pass
 * back through this process, which replaces every value it handed over with
 * a marker, so a key the app logs never reaches the terminal, the log, or
 * the coding agent that ran this. `--no-redact` gives the command the
 * terminal back, unmasked, and warns. The exit code is the command's own;
 * under --json its output goes to stderr, so stdout carries one object.
 */
export async function run(
  args: ParsedArgs,
  env: NodeJS.ProcessEnv,
  cwd: string,
  prompt?: (question: string) => Promise<string>,
  deps: RunDeps = defaultRunDeps(),
): Promise<number> {
  const [program, ...programArgs] = args.positionals;
  if (!program) {
    throw new CliError("usage", "Say what to run, after --.", { next: [command("run -- npm run dev")] });
  }

  const config = await requireConfig(cwd);
  const targets = syncTargets(config, { all: hasFlag(args, "all"), file: flagValue(args, "file"), path: null });
  const loaded = hasFlag(args, "from-vault")
    ? await vaultValues(env, config, targets.map((t) => t.file), prompt)
    : await localValues(cwd, targets.map((t) => ({ file: t.file, path: t.path ?? t.file })));

  const merged = new Map<string, string>();
  for (const { values } of loaded) for (const [key, value] of values) merged.set(key, value);

  const only = flagValue(args, "only");
  let selected = merged;
  if (only !== null) {
    const names = only.split(",").map((n) => n.trim()).filter(Boolean);
    const missing = names.filter((n) => !merged.has(n));
    if (missing.length) {
      const where = loaded.map((l) => l.file).join(", ");
      throw new CliError("not_found", `Not in ${where}: ${missing.join(", ")}.`, {
        hint: "Names are case-sensitive. `klef diff` lists the keys a file has.",
      });
    }
    selected = new Map(names.map((n) => [n, merged.get(n)!]));
  }

  const redact = !hasFlag(args, "no-redact");
  if (!redact) {
    warn("Output is not redacted: a value the command prints will show, and reach whatever is reading this.", "no_redact");
  }
  const from = loaded.map((l) => l.file).join(", ");
  const count = `${selected.size} ${selected.size === 1 ? "variable" : "variables"}`;
  note(`klef: ${count} from ${from}${redact ? `; a value in the output shows as ${REDACTED}` : ""}`);

  const result = await spawnChild(program, programArgs, {
    cwd,
    env: { ...env, ...Object.fromEntries(selected) },
    secrets: redact ? redactable(selected.values()) : null,
    // Under --json stdout is the JSON object's, so the child's goes to stderr.
    stdout: uiMode().json ? deps.stderr : deps.stdout,
    stderr: deps.stderr,
    signals: deps.signals,
  });

  emit({
    files: loaded.map((l) => ({ file: l.file, source: l.source, variables: l.values.size })),
    variables: selected.size,
    exitCode: result.exitCode,
    redactions: result.redactions,
    redacted: redact,
  });
  return result.exitCode;
}

/** Each file as it is on disk, at the path `.klef.json` gives it. */
async function localValues(cwd: string, files: { file: string; path: string }[]): Promise<Loaded[]> {
  const out: Loaded[] = [];
  for (const { file, path } of files) {
    let text: string;
    try {
      text = await readFile(resolveWritePath(cwd, path), "utf8");
    } catch (err) {
      if (err instanceof CliError) throw err;
      throw new CliError("not_found", `Can't read ${path} here.`, {
        hint: "Pull it first, or use the vault's copy with --from-vault:",
        next: [command("pull"), command("run --from-vault -- <command>")],
      });
    }
    out.push({ file, source: "local", values: envEntries(text) });
  }
  return out;
}

/** Each file's current version, decrypted in memory. Fails before decrypting anything. */
async function vaultValues(
  env: NodeJS.ProcessEnv,
  config: ProjectConfig,
  files: string[],
  prompt?: (question: string) => Promise<string>,
): Promise<Loaded[]> {
  const api = await requireApi(env);
  const tree = await api.tree();
  const resolved = files.map((file) => resolveTarget(tree, { ...config, file }));
  const versions = [];
  for (const file of resolved) {
    const { version } = await api.currentVersion(file.fileId);
    if (!version) throw new CliError("not_found", `${file.fileName} has no saved version in the vault yet.`);
    versions.push(version);
  }
  // Ciphertext only up to here. The plaintext below lives in this process
  // and the child's environment, and nowhere else.
  const cipher = await unlockedVault(await requireVault(api), env, prompt);
  const out: Loaded[] = [];
  for (const [i, file] of resolved.entries()) {
    out.push({ file: file.fileName, source: "vault", values: envEntries(await cipher.decrypt(versions[i]!.blob)) });
  }
  return out;
}

interface SpawnOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** Values to mask in the output, or null to pass the output through untouched. */
  secrets: readonly string[] | null;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  signals: Pick<NodeJS.EventEmitter, "on" | "off">;
}

/**
 * Spawn the child and wait for it. With secrets to mask, its output is piped
 * through a redactor per stream; without, it inherits this process's streams
 * (and so keeps a terminal, colours and all). stdin is always the child's.
 *
 * Ctrl-C reaches the child from the terminal already, so klef only ignores
 * SIGINT and lets the child decide how to stop; SIGTERM and SIGHUP sent to
 * klef alone are passed on.
 */
function spawnChild(
  program: string,
  programArgs: string[],
  options: SpawnOptions,
): Promise<{ exitCode: number; redactions: number }> {
  return new Promise((resolve, reject) => {
    const piped = options.secrets !== null;
    const child = spawn(program, programArgs, {
      cwd: options.cwd,
      env: options.env,
      stdio: piped ? ["inherit", "pipe", "pipe"] : "inherit",
    });

    const handlers: { signal: NodeJS.Signals; handler: () => void }[] = [
      { signal: "SIGINT", handler: () => {} },
      { signal: "SIGTERM", handler: () => void child.kill("SIGTERM") },
      { signal: "SIGHUP", handler: () => void child.kill("SIGHUP") },
    ];
    for (const { signal, handler } of handlers) options.signals.on(signal, handler);
    const finish = () => {
      for (const { signal, handler } of handlers) options.signals.off(signal, handler);
    };

    const streams = piped
      ? [pipe(child.stdout!, options.secrets!, options.stdout), pipe(child.stderr!, options.secrets!, options.stderr)]
      : [];

    child.on("error", (err: NodeJS.ErrnoException) => {
      finish();
      if (err.code === "ENOENT") reject(new CliError("not_found", `${program}: command not found.`));
      else reject(err);
    });

    // "close" rather than "exit": the stdio streams have ended by then, so
    // nothing the child printed is still in flight.
    child.on("close", (code, signal) => {
      finish();
      let redactions = 0;
      for (const stream of streams) redactions += stream.end();
      resolve({ exitCode: exitCodeFor(code, signal), redactions });
    });
  });
}

/** The shell's convention: 128 plus the signal number for a child a signal ended. */
function exitCodeFor(code: number | null, signal: NodeJS.Signals | null): number {
  if (code !== null) return code;
  return 128 + (signal ? (osConstants.signals[signal] ?? 0) : 0);
}

/** Forward one of the child's streams through a redactor, a line at a time. */
function pipe(
  stream: NodeJS.ReadableStream,
  secrets: readonly string[],
  out: (text: string) => void,
): { end: () => number } {
  const decoder = new StringDecoder("utf8");
  const redactor = createRedactor(secrets);
  let idle: NodeJS.Timeout | null = null;

  const emitText = (text: string) => {
    if (text) out(text);
  };
  stream.on("data", (chunk: Buffer) => {
    if (idle) clearTimeout(idle);
    emitText(redactor.write(decoder.write(chunk)));
    idle = setTimeout(() => emitText(redactor.flush()), IDLE_FLUSH_MS);
  });

  return {
    end: () => {
      if (idle) clearTimeout(idle);
      emitText(redactor.write(decoder.end()));
      emitText(redactor.flush());
      return redactor.redactions;
    },
  };
}
