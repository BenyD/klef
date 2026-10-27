// SPDX-License-Identifier: AGPL-3.0-or-later

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { flagValue, hasFlag, type ParsedArgs } from "../args.ts";
import { requireConfig, requireVault, unlockedVault } from "../common.ts";
import { envEntries } from "../dotenv-values.ts";
import { command } from "../invocation.ts";
import { localPathFor } from "../project-config.ts";
import { resolveTarget } from "../resolve.ts";
import { requireApi } from "../session.ts";
import { CliError, note, uiMode } from "../ui.ts";
import { resolveWritePath } from "../write-path.ts";

/**
 * Run a command with an env file's variables in its environment, so nothing
 * (and no agent) has to open the file to use what is in it: testing an API
 * key, pointing a one-off query at DATABASE_URL, starting a dev server.
 *
 * The local file is read by default, which needs no unlock; `--from-vault`
 * decrypts the vault's copy instead. `--only` passes just the named keys.
 *
 * klef itself prints no value. The command it runs is another matter: it gets
 * the values in its environment, and anything it prints goes straight to the
 * terminal (or to whatever agent ran it). stdin, stdout, stderr and the exit
 * code pass through untouched, with no masking: a command that echoes a value
 * shows the value, so run only commands that use them.
 */
export async function run(
  args: ParsedArgs,
  env: NodeJS.ProcessEnv,
  cwd: string,
  prompt?: (question: string) => Promise<string>,
  spawnChild: typeof spawn = spawn,
): Promise<number> {
  const [cmd, ...cmdArgs] = args.positionals;
  if (!cmd) {
    throw new CliError("usage", "Say what to run, after --.", { next: [command("run -- npm run dev")] });
  }
  if (uiMode().json) {
    throw new CliError("usage", "run passes the command's own output through, so it has no --json.");
  }

  const config = await requireConfig(cwd);
  const file = flagValue(args, "file") ?? config.file;
  const values = hasFlag(args, "from-vault")
    ? await vaultValues(env, config, file, prompt)
    : await localValues(cwd, localPathFor(config, file) ?? file);

  const only = flagValue(args, "only");
  let selected = values;
  if (only !== null) {
    const names = only.split(",").map((n) => n.trim()).filter(Boolean);
    const missing = names.filter((n) => !values.has(n));
    if (missing.length) {
      throw new CliError("not_found", `Not in ${file}: ${missing.join(", ")}.`, {
        hint: "Names are case-sensitive. `klef diff` lists the keys a file has.",
      });
    }
    selected = new Map(names.map((n) => [n, values.get(n)!]));
  }

  note(`klef: ${selected.size} ${selected.size === 1 ? "variable" : "variables"} from ${file}`);
  return passThrough(spawnChild, cmd, cmdArgs, { cwd, env: { ...env, ...Object.fromEntries(selected) } });
}

async function localValues(cwd: string, path: string): Promise<Map<string, string>> {
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
  return envEntries(text);
}

async function vaultValues(
  env: NodeJS.ProcessEnv,
  config: Awaited<ReturnType<typeof requireConfig>>,
  file: string,
  prompt?: (question: string) => Promise<string>,
): Promise<Map<string, string>> {
  const api = await requireApi(env);
  const resolved = resolveTarget(await api.tree(), { ...config, file });
  const { version } = await api.currentVersion(resolved.fileId);
  if (!version) {
    throw new CliError("not_found", `${resolved.fileName} has no saved version in the vault yet.`);
  }
  const cipher = await unlockedVault(await requireVault(api), env, prompt);
  return envEntries(await cipher.decrypt(version.blob));
}

/** 128 + the signal's number, the shell's convention for a command a signal ended. */
const SIGNALS: Record<string, number> = { SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGKILL: 9, SIGTERM: 15 };

/**
 * Run the child on this terminal and hand back its exit code. While it runs,
 * klef ignores the Ctrl-C and SIGTERM the child also receives, so the child
 * decides how to stop and klef reports what it decided.
 */
function passThrough(
  spawnChild: typeof spawn,
  cmd: string,
  cmdArgs: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<number> {
  return new Promise((resolve, reject) => {
    const ignore = () => {};
    const forwarded = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
    for (const sig of forwarded) process.on(sig, ignore);
    const done = () => {
      for (const sig of forwarded) process.off(sig, ignore);
    };

    const child = spawnChild(cmd, cmdArgs, { cwd: options.cwd, env: options.env, stdio: "inherit" });
    child.on("error", (err) => {
      done();
      if ("code" in err && err.code === "ENOENT") {
        reject(new CliError("not_found", `${cmd}: command not found.`));
      } else {
        reject(err);
      }
    });
    child.on("exit", (code, signal) => {
      done();
      resolve(code ?? (signal ? 128 + (SIGNALS[signal] ?? 0) : 1));
    });
  });
}
