// SPDX-License-Identifier: AGPL-3.0-or-later

import { command } from "../invocation.ts";
import { requireApi } from "../session.ts";
import { readProjectConfig } from "../project-file.ts";
import { CONFIG_FILENAME } from "../project-config.ts";
import { openVault } from "../vault-key.ts";
import { confirm } from "../prompt.ts";
import { flagValue, hasFlag, type ParsedArgs } from "../args.ts";
import { findFile, resolveProject } from "../resolve.ts";
import { environmentFor } from "../default-files.ts";
import { formatEnvText } from "../dotenv-values.ts";
import { readVercel } from "../deploy-targets.ts";
import { countVariables } from "../output.ts";
import { UsageError } from "../targets.ts";

/** The Klef file a Vercel environment lands in, by the same names `link` records. */
export function importFileName(environment: string): string {
  if (environment === "production") return ".env.production";
  if (environment === "development") return ".env.local";
  return `.env.${environment}`;
}

/**
 * A one-time move from Vercel into Klef: read an environment's variables
 * through the user's own `vercel`, build an env file from them in Vercel's
 * order, encrypt it here, and save it as a version. The values never touch
 * disk on the way except inside `vercel env pull`'s temporary file (see
 * readVercel), and never reach the terminal.
 *
 * What cannot come across: comments and formatting, which Vercel never had,
 * and Sensitive variables, which Vercel will not reveal to anyone. Their
 * names are listed so they can be added by hand.
 *
 * An existing Klef file with a saved version is not replaced without
 * `--force`, and with it the question is asked even under `-y`: replacing a
 * file's current version from another system deserves a human's yes.
 */
export async function importFrom(
  args: ParsedArgs,
  env: NodeJS.ProcessEnv,
  cwd: string,
  prompt?: (question: string) => Promise<string>,
  ask: (question: string) => Promise<boolean> = confirm,
): Promise<number> {
  const from = flagValue(args, "from");
  if (from !== "vercel") {
    throw new UsageError(
      "Only Vercel can be imported from (--from vercel): GitHub and Cloudflare secrets cannot be read back.",
    );
  }
  const config = await readProjectConfig(cwd);
  if (!config) {
    console.error(`No ${CONFIG_FILENAME} here. Run \`${command("link")}\` first.`);
    return 1;
  }

  const environment = flagValue(args, "env") ?? "production";
  const fileName = flagValue(args, "file") ?? importFileName(environment);
  const force = hasFlag(args, "force");

  const api = await requireApi(env);
  const tree = await api.tree();
  const existing = findFile(tree, { ...config, file: fileName });
  if (existing?.currentVersionId && !force) {
    console.error(
      `${existing.fileName} already has a saved version in Klef. Nothing imported. ` +
        `Pass --force to replace it (the old version is kept and can be restored).`,
    );
    return 1;
  }

  const remote = await readVercel({ cwd, env }, { kind: "vercel", environment, worker: null });
  const readable = remote.filter((v): v is { name: string; value: string } => v.value !== null);
  const sensitive = remote.filter((v) => v.value === null).map((v) => v.name);
  if (readable.length === 0) {
    console.log(`Nothing readable in Vercel's ${environment} environment.`);
    if (sensitive.length) console.log(`Sensitive, add by hand: ${sensitive.join(", ")}`);
    return 1;
  }
  const text = formatEnvText(readable.map((v) => [v.name, v.value]));

  const { workspace, project } = resolveProject(tree, config);
  const target = `${workspace.name} / ${project.name} / ${existing?.fileName ?? fileName}`;
  console.log(
    `About to ${existing?.currentVersionId ? "replace" : "create"} ${target} with ` +
      `${countVariables(text)} variables from Vercel's ${environment} environment.`,
  );
  if (sensitive.length) {
    console.log(`  Sensitive on Vercel, so not readable: ${sensitive.join(", ")}`);
  }
  console.log("  Comments and formatting are not recoverable from Vercel; each variable is one line.");
  const mustAsk = !hasFlag(args, "yes", "y") || existing?.currentVersionId;
  if (mustAsk && !(await ask(existing?.currentVersionId ? "Replace it?" : "Import?"))) {
    console.log("Nothing imported.");
    return 1;
  }

  const vault = await api.vault();
  if (!vault.exists || !vault.keyMaterial) {
    console.error("This account has no vault yet. Set one up in the web app first.");
    return 1;
  }
  const cipher = await openVault(vault.keyMaterial, env, prompt);
  const fileId =
    existing?.fileId ??
    (await api.createFile(project.id, fileName, environmentFor(fileName) ?? environment)).id;
  const saved = await api.saveVersion(fileId, await cipher.encrypt(text));

  console.log(
    `Imported ${countVariables(text)} variables into ${existing?.fileName ?? fileName} (version ${saved.id.slice(0, 8)}).`,
  );
  if (sensitive.length) {
    console.log(`Add ${sensitive.length === 1 ? "this one" : "these"} by hand: ${sensitive.join(", ")}`);
  }
  console.log(`Run \`${command(`pull --file ${fileName}`)}\` to bring it into this directory.`);
  return 0;
}
