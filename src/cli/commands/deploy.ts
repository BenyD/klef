// SPDX-License-Identifier: AGPL-3.0-or-later
//
// `klef push --to vercel|github|cloudflare` and `klef status --targets`.

import { existsSync } from "node:fs";
import path from "node:path";
import { command } from "../invocation.ts";
import { requireApi } from "../session.ts";
import { readProjectConfig } from "../project-file.ts";
import { CONFIG_FILENAME, type ProjectConfig } from "../project-config.ts";
import { openVault } from "../vault-key.ts";
import { confirm } from "../prompt.ts";
import { flagValue, hasFlag, type ParsedArgs } from "../args.ts";
import { inspectProject } from "../project-sync.ts";
import { envEntries } from "../dotenv-values.ts";
import { UsageError } from "../targets.ts";
import {
  deployPlan,
  describeScope,
  isTargetKind,
  listNames,
  readVercel,
  readWorkerName,
  sameName,
  setValues,
  TARGET_KINDS,
  validSecretName,
  type DeployItem,
  type TargetKind,
} from "../deploy-targets.ts";
import { formatDrift, nameDrift, vercelValueDrift } from "../deploy-drift.ts";

function targetKind(raw: string): TargetKind {
  if (!isTargetKind(raw)) {
    throw new UsageError(`Unknown target "${raw}". Use one of: ${TARGET_KINDS.join(", ")}.`);
  }
  return raw;
}

function planFlags(args: ParsedArgs) {
  return {
    file: flagValue(args, "file"),
    env: flagValue(args, "env"),
    name: flagValue(args, "name"),
    all: hasFlag(args, "all"),
  };
}

/**
 * The vault's copy of each item's file, decrypted here. The vault is the
 * source: what a target receives is what Klef holds, so a local file that
 * has drifted from it stops the command and points at `sync` instead of
 * quietly deploying one or the other.
 */
async function vaultCopies(
  env: NodeJS.ProcessEnv,
  cwd: string,
  config: ProjectConfig,
  items: DeployItem[],
  prompt?: (question: string) => Promise<string>,
): Promise<string[]> {
  const api = await requireApi(env);
  const tree = await api.tree();
  const vault = await api.vault();
  if (!vault.exists || !vault.keyMaterial) {
    throw new UsageError("This account has no vault yet. Set one up in the web app first.");
  }
  const cipher = await openVault(vault.keyMaterial, env, prompt);
  const files = await inspectProject({ api, tree, cipher, env }, cwd, config, items.map((i) => i.entry));

  return files.map((file) => {
    if (!file.vault) {
      throw new UsageError(
        `${file.entry.file} has no saved version in the vault. Run \`${command("sync")}\` first.`,
      );
    }
    if (file.local && file.decision.action !== "in-sync") {
      throw new UsageError(
        `${path.relative(cwd, file.destination)} differs from the vault (${file.decision.reason}). ` +
          `Run \`${command("sync")}\` first, so what you deploy is what Klef holds.`,
      );
    }
    return file.vault.text;
  });
}

async function requireConfig(cwd: string): Promise<ProjectConfig | null> {
  const config = await readProjectConfig(cwd);
  if (!config) console.error(`No ${CONFIG_FILENAME} here. Run \`${command("link")}\` first.`);
  return config;
}

/**
 * Send a file's values to a deploy target through the user's own CLI for it.
 * Adds and updates only: a name on the target that the file lacks is listed
 * and left alone, since deleting a production variable is not something to
 * do as a side effect.
 */
export async function pushTo(
  args: ParsedArgs,
  env: NodeJS.ProcessEnv,
  cwd: string,
  prompt?: (question: string) => Promise<string>,
  ask: (question: string) => Promise<boolean> = confirm,
): Promise<number> {
  const kind = targetKind(flagValue(args, "to") ?? "");
  const config = await requireConfig(cwd);
  if (!config) return 1;

  const items = deployPlan(kind, config, planFlags(args));
  const worker = kind === "cloudflare" ? readWorkerName(cwd) : null;
  if (kind === "cloudflare" && !worker && !items[0]!.scope.worker) {
    console.error("No Worker name in wrangler.jsonc or wrangler.toml here. Name it with --name.");
    return 1;
  }
  const texts = await vaultCopies(env, cwd, config, items, prompt);
  const tools = { cwd, env };

  const pending: { item: DeployItem; label: string; values: Map<string, string> }[] = [];
  for (const [i, item] of items.entries()) {
    const label = describeScope(item.scope, worker);
    const values = new Map<string, string>();
    const empty: string[] = [];
    const refused: string[] = [];
    for (const [name, value] of envEntries(texts[i]!)) {
      if (!validSecretName(kind, name)) refused.push(name);
      else if (value === "") empty.push(name);
      else values.set(name, value);
    }

    const remote = await listNames(tools, item.scope);
    const existing = [...values.keys()].filter((n) => remote.some((r) => sameName(kind, n, r)));
    const { extra } = nameDrift(kind, values.keys(), remote);

    console.log(
      `About to set ${values.size} ${values.size === 1 ? "variable" : "variables"} on ${label} ` +
        `from ${item.entry.file}: ${values.size - existing.length} new, ${existing.length} already there.`,
    );
    if (extra.length) console.log(`  Left alone, only on ${label}: ${extra.join(", ")}`);
    if (empty.length) console.log(`  Skipped, empty in Klef: ${empty.join(", ")}`);
    if (refused.length) console.log(`  Skipped, names GitHub does not accept: ${refused.join(", ")}`);
    if (values.size) pending.push({ item, label, values });
  }

  if (pending.length === 0) {
    console.log("Nothing to send.");
    return 0;
  }
  const question = pending.length === 1 ? "Send?" : `Send ${pending.length} files?`;
  if (!hasFlag(args, "yes", "y") && !(await ask(question))) {
    console.log("Nothing sent.");
    return 1;
  }

  for (const { item, label, values } of pending) {
    await setValues(tools, item.scope, values);
    console.log(`Set ${values.size} ${values.size === 1 ? "variable" : "variables"} on ${label}.`);
  }
  return 0;
}

/** Targets this checkout is set up for, when `--to` does not say. */
function detectedTargets(cwd: string): TargetKind[] {
  const found: TargetKind[] = [];
  if (existsSync(path.join(cwd, ".vercel", "project.json"))) found.push("vercel");
  if (existsSync(path.join(cwd, ".git"))) found.push("github");
  if (["wrangler.jsonc", "wrangler.json", "wrangler.toml"].some((f) => existsSync(path.join(cwd, f)))) {
    found.push("cloudflare");
  }
  return found;
}

/**
 * Compare Klef's files with each deploy target: names everywhere, and values
 * on Vercel where a variable is not Sensitive. Prints names and verdicts,
 * never a value. Read-only on every side.
 */
export async function targetStatus(
  args: ParsedArgs,
  env: NodeJS.ProcessEnv,
  cwd: string,
  prompt?: (question: string) => Promise<string>,
): Promise<number> {
  const config = await requireConfig(cwd);
  if (!config) return 1;

  const to = flagValue(args, "to");
  const kinds = to ? [targetKind(to)] : detectedTargets(cwd);
  if (kinds.length === 0) {
    console.log(
      "No deploy targets found here (.vercel/project.json, .git, wrangler config). Name one with --to.",
    );
    return 1;
  }

  const planned: DeployItem[] = [];
  for (const kind of kinds) {
    try {
      planned.push(...deployPlan(kind, config, { ...planFlags(args), all: false }));
    } catch (err) {
      if (!(err instanceof UsageError) || to) throw err;
      console.log(`${kind}: ${err.message}`);
    }
  }
  if (planned.length === 0) return 1;

  const texts = await vaultCopies(env, cwd, config, planned, prompt);
  const tools = { cwd, env };
  const worker = readWorkerName(cwd);

  for (const [i, item] of planned.entries()) {
    const local = envEntries(texts[i]!);
    console.log(`${describeScope(item.scope, worker)}  (${item.entry.file})`);
    if (item.scope.kind === "vercel") {
      const remote = await readVercel(tools, item.scope);
      const names = nameDrift("vercel", local.keys(), remote.map((v) => v.name));
      for (const line of formatDrift(names, vercelValueDrift(local, remote))) console.log(line);
    } else {
      const names = nameDrift(item.scope.kind, local.keys(), await listNames(tools, item.scope));
      for (const line of formatDrift(names, null)) console.log(line);
    }
  }
  return 0;
}
