// SPDX-License-Identifier: MIT

import { flagValue, type ParsedArgs } from "../args.ts";
import { requireConfig, requireVault, unlockedVault } from "../common.ts";
import { command } from "../invocation.ts";
import { resolveTarget } from "../resolve.ts";
import { requireApi } from "../session.ts";
import { isKeyName, rawValueOf } from "../set-key.ts";
import { cmd, CliError, done, emit, note } from "../ui.ts";
import { localTarget, writeKey } from "./set.ts";

/**
 * Bring one variable back from an earlier vault version into the local file,
 * leaving every other line alone: for when a push replaced a file and took a
 * key with it. The version is named by its id or a prefix of it, from
 * `klef list --versions`. Like `set`, it writes only locally; `push` or
 * `sync` saves it. The value is copied as written and never printed.
 */
export async function recover(
  args: ParsedArgs,
  env: NodeJS.ProcessEnv,
  cwd: string,
  prompt?: (question: string) => Promise<string>,
): Promise<number> {
  const name = args.positionals[0];
  const from = flagValue(args, "from");
  if (!name || !from) {
    throw new CliError("usage", "Name the variable and the version to take it from.", {
      next: [command("list --versions"), command("recover API_KEY --from <version>")],
    });
  }
  if (!isKeyName(name)) throw new CliError("usage", `"${name}" is not a variable name.`);

  const config = await requireConfig(cwd);
  const target = localTarget(config, flagValue(args, "file"), cwd);
  const api = await requireApi(env);
  const resolved = resolveTarget(await api.tree(), { ...config, file: target.file });
  const { versions } = await api.versions(resolved.fileId);
  const matches = versions.filter((v) => v.id.startsWith(from));
  if (matches.length !== 1) {
    throw new CliError("not_found", matches.length ? `"${from}" matches ${matches.length} versions; give more of the id.` : `No version of ${resolved.fileName} starts with "${from}".`, {
      next: [command(`list --versions${target.flag}`)],
    });
  }
  const version = matches[0]!;

  const cipher = await unlockedVault(await requireVault(api), env, prompt);
  const { version: stored } = await api.version(resolved.fileId, version.id);
  const raw = rawValueOf(await cipher.decrypt(stored.blob), name);
  if (raw === null) {
    throw new CliError("not_found", `${name} is not in version ${version.id.slice(0, 8)} of ${resolved.fileName}.`, {
      next: [command(`list --versions${target.flag}`)],
    });
  }

  const result = await writeKey(target.absolute, name, raw);
  done(`set ${name} in ${target.shown} from version ${version.id.slice(0, 8)}`);
  note(`${cmd(command("push"), true)} or ${cmd(command("sync"), true)} saves it to the vault.`);
  emit({ name, file: resolved.fileName, path: target.shown, version: version.id, added: result.added });
  return 0;
}
