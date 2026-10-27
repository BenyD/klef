// SPDX-License-Identifier: AGPL-3.0-or-later

import { spawn } from "node:child_process";
import { constants as osConstants } from "node:os";
import { StringDecoder } from "node:string_decoder";
import { command as suggested } from "../invocation.ts";
import { requireApi } from "../session.ts";
import type { CurrentVersion } from "../api.ts";
import { resolveTarget } from "../resolve.ts";
import { requireConfig, requireVault, unlockedVault } from "../common.ts";
import { CliError, emit, note, uiMode, warn } from "../ui.ts";
import { syncTargets } from "../targets.ts";
import { flagValue, hasFlag, type ParsedArgs } from "../args.ts";
import { envValues } from "../env-values.ts";
import { createRedactor, REDACTED, redactable } from "../redact.ts";

/**
 * How long a partial line is held before it is forwarded anyway. A prompt
 * with no newline after it ("Password: ") would otherwise never show. A
 * value split across two pipe reads arrives in one go, long before this.
 */
const IDLE_FLUSH_MS = 100;

/** What the command touches outside the vault, replaceable in tests. */
export interface RunDeps {
  /** Where the child's forwarded output goes. */
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** Where SIGINT and SIGTERM arrive, to pass on to the child. */
  signals: Pick<NodeJS.EventEmitter, "on" | "off">;
}

export function defaultRunDeps(): RunDeps {
  return {
    stdout: (text) => void process.stdout.write(text),
    stderr: (text) => void process.stderr.write(text),
    signals: process,
  };
}

/**
 * Run a command with the vault's variables in its environment, and nothing on
 * disk. The env file is decrypted in memory, parsed as dotenv would, merged
 * over this process's environment (the file wins), and handed to the child.
 * The child's stdout and stderr pass through this process, which replaces
 * every secret value it finds with a marker, so a key the app prints never
 * reaches the terminal, the log, or the coding agent that ran this.
 *
 * The exit code is the child's; SIGINT and SIGTERM are passed on to it.
 * Under --json the child's output goes to stderr, so stdout still carries
 * exactly one object.
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
    throw new CliError("usage", "Say what to run, after --.", { next: [suggested("run -- npm run dev")] });
  }
  if (hasFlag(args, "path")) throw new CliError("usage", "run writes no file, so it takes no --path.");

  const config = await requireConfig(cwd);
  const targets = syncTargets(config, { all: hasFlag(args, "all"), file: flagValue(args, "file"), path: null });

  const api = await requireApi(env);
  const tree = await api.tree();
  const resolved = targets.map((target) => resolveTarget(tree, { ...config, file: target.file }));
  for (const file of resolved) {
    if (!file.currentVersionId) {
      throw new CliError("not_found", `${file.fileName} has no saved version yet, so there is nothing to run with.`, {
        hint: "Push it first, or save it in the web app.",
        next: [suggested(`push --file ${file.fileName}`)],
      });
    }
  }

  const keyMaterial = await requireVault(api);
  const versions: CurrentVersion[] = [];
  for (const file of resolved) {
    const { version } = await api.currentVersion(file.fileId);
    if (!version) {
      throw new CliError("server", "The current version disappeared between listing and fetching it.", {
        hint: "Something saved at the same moment. Run it again.",
      });
    }
    versions.push(version);
  }

  // Ciphertext only up to here. The plaintext below lives in this process
  // and the child's environment, and nowhere else.
  const cipher = await unlockedVault(keyMaterial, env, prompt);
  const variables = new Map<string, string>();
  const files: { file: string; variables: number; version: string }[] = [];
  for (const [i, file] of resolved.entries()) {
    const values = envValues(await cipher.decrypt(versions[i]!.blob));
    for (const [key, value] of values) variables.set(key, value);
    files.push({ file: file.fileName, variables: values.size, version: versions[i]!.id });
  }

  const redact = !hasFlag(args, "no-redact");
  if (!redact) {
    warn("Output is not redacted: a value the command prints will show, and reach whatever is reading this.", "no_redact");
  }
  const names = files.map((f) => f.file).join(", ");
  const count = `${variables.size} ${variables.size === 1 ? "variable" : "variables"}`;
  note(`Running ${program} with ${count} from ${names}${redact ? `; a value in its output shows as ${REDACTED}` : ""}`);

  const result = await spawnRedacted(program, programArgs, {
    cwd,
    env: { ...env, ...Object.fromEntries(variables) },
    secrets: redact ? redactable(variables.values()) : null,
    // Under --json stdout is the JSON object's, so the child's goes to stderr.
    stdout: uiMode().json ? deps.stderr : deps.stdout,
    stderr: deps.stderr,
    signals: deps.signals,
  });

  emit({ files, exitCode: result.exitCode, redactions: result.redactions, redacted: redact });
  return result.exitCode;
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
 * (and so keeps a terminal, colours and all).
 */
function spawnRedacted(
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

    const forwarders: { signal: NodeJS.Signals; handler: () => void }[] = (["SIGINT", "SIGTERM"] as const).map(
      (signal) => ({ signal, handler: () => void child.kill(signal) }),
    );
    for (const { signal, handler } of forwarders) options.signals.on(signal, handler);

    const streams = piped
      ? [
          pipe(child.stdout!, options.secrets!, options.stdout),
          pipe(child.stderr!, options.secrets!, options.stderr),
        ]
      : [];

    const finish = () => {
      for (const { signal, handler } of forwarders) options.signals.off(signal, handler);
    };

    child.on("error", (err: NodeJS.ErrnoException) => {
      finish();
      const why = err.code === "ENOENT" ? "command not found" : err.message;
      reject(new CliError("usage", `Could not run ${program}: ${why}.`));
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
