// SPDX-License-Identifier: AGPL-3.0-or-later

import { readFile } from "node:fs/promises";
import path from "node:path";
import { flagValue, type ParsedArgs } from "../args.ts";
import { requireConfig } from "../common.ts";
import { encodeValue } from "../dotenv-values.ts";
import { writeEnvFile } from "../env-file.ts";
import { command } from "../invocation.ts";
import { localPathFor, type ProjectConfig } from "../project-config.ts";
import { NoTerminalError, promptSecret } from "../prompt.ts";
import { isKeyName, setKey } from "../set-key.ts";
import { cmd, CliError, done, emit, note, uiMode } from "../ui.ts";
import { resolveWritePath } from "../write-path.ts";

/**
 * Set one variable in a local env file, with the value typed at the terminal.
 *
 * The value is read from /dev/tty with echo off, exactly like the
 * passphrase: never from argv (which `ps` shows), stdin or a variable, so
 * whatever ran klef can neither supply nor see it. An agent therefore cannot
 * set a value; a person types it. Only that key's line changes, and only
 * locally: `push` or `sync` saves it to the vault.
 */
export async function set(
  args: ParsedArgs,
  env: NodeJS.ProcessEnv,
  cwd: string,
  prompt: (question: string) => Promise<string> = promptSecret,
): Promise<number> {
  const name = args.positionals[0];
  if (!name || args.positionals.length > 1) {
    throw new CliError("usage", "Name one variable; the value is typed at the prompt, never on the command line.", {
      next: [command("set API_KEY")],
    });
  }
  if (!isKeyName(name)) throw new CliError("usage", `"${name}" is not a variable name.`);
  const config = await requireConfig(cwd);
  const target = localTarget(config, flagValue(args, "file"), cwd);

  if (!uiMode().input) {
    throw new CliError("no_terminal", "set reads the value at a terminal, and prompts are off.", {
      hint: "A person types the value. Run it in your own terminal.",
    });
  }
  let value: string;
  try {
    value = await prompt(`Value for ${name} (not shown): `);
  } catch (err) {
    if (!(err instanceof NoTerminalError)) throw err;
    throw new CliError("no_terminal", "set needs a person to type the value at a terminal.", {
      hint: "If an agent ran this, ask the user to run it in their own terminal:",
      next: [command(`set ${name}${target.flag}`)],
    });
  }

  const result = await writeKey(target.absolute, name, encodeValue(value));
  done(`set ${name} in ${target.shown}`);
  note(`${cmd(command("push"), true)} or ${cmd(command("sync"), true)} saves it to the vault.`);
  emit({ name, file: target.file, path: target.shown, added: result.added });
  return 0;
}

/** Where a vault file lives here, by its `.klef.json` entry. */
export function localTarget(config: ProjectConfig, fileFlag: string | null, cwd: string) {
  const file = fileFlag ?? config.file;
  const local = localPathFor(config, file) ?? file;
  const absolute = resolveWritePath(cwd, local);
  return { file, absolute, shown: path.relative(cwd, absolute), flag: fileFlag ? ` --file ${fileFlag}` : "" };
}

/** Set one key in a local file, creating the file (0600) if it is not there. */
export async function writeKey(file: string, key: string, rawValue: string): Promise<{ added: boolean }> {
  const text = await readFile(file, "utf8").catch(() => "");
  const next = setKey(text, key, rawValue);
  await writeEnvFile(file, next.text);
  return { added: next.added };
}
