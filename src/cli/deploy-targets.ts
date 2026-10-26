// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Vercel, GitHub Actions and Cloudflare Workers as places to send a file's
// values, and to compare it against. Values are decrypted on this machine
// and handed to the user's own `vercel`, `gh` or `wrangler` on stdin; the
// Klef server never sees them, and klef never sees those tools' tokens.
//
// What each target can say back differs, and so does what is built on it:
//
// | target     | write                    | read names        | read values           |
// |------------|--------------------------|-------------------|-----------------------|
// | Vercel     | `env add` per key, stdin | `env ls --json`   | `env pull`, if not Sensitive |
// | GitHub     | `secret set` per key     | `secret list`     | never                 |
// | Cloudflare | `secret bulk`, JSON      | `secret list`     | never                 |

import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { environmentFor } from "./default-files.ts";
import { parseVercelPull } from "./dotenv-values.ts";
import { allFiles, localPathFor, type FileEntry, type ProjectConfig } from "./project-config.ts";
import { failureLine, runTool, ToolError, type ToolResult } from "./run-tool.ts";
import { UsageError } from "./targets.ts";

export const TARGET_KINDS = ["vercel", "github", "cloudflare"] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

export function isTargetKind(value: string): value is TargetKind {
  return (TARGET_KINDS as readonly string[]).includes(value);
}

export interface TargetScope {
  kind: TargetKind;
  /**
   * Vercel: the environment (always set). GitHub: a deployment environment,
   * or null for repository secrets. Cloudflare: a wrangler environment, or
   * null for the Worker itself.
   */
  environment: string | null;
  /** Cloudflare only: the Worker, or null for the one in the wrangler config. */
  worker: string | null;
}

export interface DeployItem {
  entry: FileEntry;
  scope: TargetScope;
}

const VERCEL_ENVIRONMENTS = new Set(["development", "preview", "production"]);

/**
 * Which files go where, from `.klef.json` and the flags. Pure.
 *
 * Vercel takes every listed file it has an environment for (`.env.local` to
 * Development, `.env.production` to Production), or the one `--file` names.
 * GitHub and Cloudflare hold one set of secrets per scope, so they take one
 * file: `--file`, or by default the production file.
 */
export function deployPlan(
  kind: TargetKind,
  config: ProjectConfig,
  flags: { file: string | null; env: string | null; name: string | null; all: boolean },
): DeployItem[] {
  if (flags.name && kind !== "cloudflare") {
    throw new UsageError("--name picks a Cloudflare Worker; it does nothing for Vercel or GitHub.");
  }
  const entry = (file: string): FileEntry => ({ file, path: localPathFor(config, file) ?? file });

  if (kind === "vercel") {
    if (flags.all && flags.file) throw new UsageError("--all and --file pick files two ways; use one.");
    const entries = flags.file ? [entry(flags.file)] : allFiles(config);
    const items: DeployItem[] = [];
    for (const e of entries) {
      const environment = flags.env ?? environmentFor(e.file);
      if (!environment) {
        if (flags.file) {
          throw new UsageError(
            `klef cannot tell which Vercel environment ${e.file} is for. Name it with --env.`,
          );
        }
        continue;
      }
      items.push({ entry: e, scope: { kind, environment, worker: null } });
    }
    if (flags.env && items.length > 1) {
      throw new UsageError("--env sends one file to one environment; name the file with --file.");
    }
    if (items.length === 0) {
      throw new UsageError(
        "No listed file maps to a Vercel environment (.env.local, .env.production). Name one with --file and --env.",
      );
    }
    return items;
  }

  if (flags.all) {
    throw new UsageError(
      `${label(kind)} holds one set of secrets per scope, so it takes one file. Name it with --file.`,
    );
  }
  const file =
    flags.file ?? allFiles(config).find((e) => environmentFor(e.file) === "production")?.file;
  if (!file) {
    throw new UsageError(`No production file is listed in .klef.json. Name one with --file.`);
  }
  if (kind === "cloudflare" && environmentFor(file) !== "production" && !flags.env && !flags.name) {
    throw new UsageError(
      `${file} is not the production file. Say which Worker it is for with --env or --name.`,
    );
  }
  return [{ entry: entry(file), scope: { kind, environment: flags.env, worker: flags.name } }];
}

function label(kind: TargetKind): string {
  return kind === "vercel" ? "Vercel" : kind === "github" ? "GitHub" : "Cloudflare";
}

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Where a scope lands, in words: "Vercel Production", "GitHub repository secrets". */
export function describeScope(scope: TargetScope, workerName: string | null = null): string {
  if (scope.kind === "vercel") {
    const env = scope.environment ?? "";
    return VERCEL_ENVIRONMENTS.has(env) ? `Vercel ${titleCase(env)}` : `Vercel environment "${env}"`;
  }
  if (scope.kind === "github") {
    return scope.environment
      ? `GitHub environment "${scope.environment}" secrets`
      : "GitHub repository secrets";
  }
  const worker = scope.worker ?? workerName;
  const name = worker ? `Cloudflare Worker "${worker}"` : "Cloudflare Worker";
  return scope.environment ? `${name} (env ${scope.environment})` : name;
}

/** Names GitHub refuses: anything but letters, digits and `_`, a leading digit, or `GITHUB_`. */
export function validSecretName(kind: TargetKind, name: string): boolean {
  if (kind !== "github") return true;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !/^GITHUB_/i.test(name);
}

/** GitHub stores secret names upper-cased and treats them case-insensitively. */
export function sameName(kind: TargetKind, a: string, b: string): boolean {
  return kind === "github" ? a.toUpperCase() === b.toUpperCase() : a === b;
}

/**
 * The Worker name in `wrangler.jsonc` / `wrangler.json` / `wrangler.toml`,
 * for labels only: wrangler resolves the real one itself. The first top-level
 * `name` is taken, which is where wrangler's own templates put it.
 */
export function readWorkerName(cwd: string): string | null {
  for (const file of ["wrangler.jsonc", "wrangler.json"]) {
    const full = path.join(cwd, file);
    if (!existsSync(full)) continue;
    const match = /"name"\s*:\s*"([^"]+)"/.exec(readFileSync(full, "utf8"));
    if (match) return match[1]!;
  }
  const toml = path.join(cwd, "wrangler.toml");
  if (existsSync(toml)) {
    const head = readFileSync(toml, "utf8").split(/^\[/m)[0]!;
    const match = /^\s*name\s*=\s*"([^"]+)"/m.exec(head);
    if (match) return match[1]!;
  }
  return null;
}

/** A Vercel variable: its value, or null where Vercel will not say (Sensitive). */
export interface VercelVar {
  name: string;
  value: string | null;
}

export interface ToolContext {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

function binary(ctx: ToolContext, name: string): string {
  // wrangler is usually a dev dependency rather than a global install.
  const local = path.join(ctx.cwd, "node_modules", ".bin", name);
  return name === "wrangler" && existsSync(local) ? local : name;
}

async function run(
  ctx: ToolContext,
  name: string,
  args: string[],
  input?: string,
  values: Iterable<string> = [],
): Promise<ToolResult> {
  const result = await runTool(binary(ctx, name), args, { cwd: ctx.cwd, env: ctx.env, input });
  if (result.code !== 0) {
    throw new ToolError(`\`${name} ${args.slice(0, 2).join(" ")}\` failed: ${failureLine(result, values)}`);
  }
  return result;
}

/** JSON from a tool's stdout, tolerating a banner line before it. Never quotes the output. */
function parseJson(stdout: string, what: string): unknown {
  const start = stdout.search(/[[{]/);
  try {
    return JSON.parse(start === -1 ? stdout : stdout.slice(start));
  } catch {
    throw new ToolError(`Could not read the output of ${what}.`);
  }
}

function scopeArgs(scope: TargetScope): string[] {
  if (scope.kind === "github") return scope.environment ? ["--env", scope.environment] : [];
  if (scope.kind === "cloudflare") {
    return [
      ...(scope.worker ? ["--name", scope.worker] : []),
      ...(scope.environment ? ["--env", scope.environment] : []),
    ];
  }
  return [];
}

interface VercelListed {
  key: string;
  type?: string;
  visibility?: string;
}

async function vercelListed(ctx: ToolContext, scope: TargetScope): Promise<VercelListed[]> {
  const result = await run(ctx, "vercel", ["env", "ls", scope.environment!, "--format", "json"]);
  const parsed = parseJson(result.stdout, "vercel env ls") as { envs?: VercelListed[] };
  const seen = new Set<string>();
  // System variables (VERCEL_URL and the like) are Vercel's, not the user's.
  return (parsed.envs ?? []).filter((e) => {
    if (typeof e.key !== "string" || e.type === "system" || seen.has(e.key)) return false;
    seen.add(e.key);
    return true;
  });
}

/** Names the target holds in this scope. */
export async function listNames(ctx: ToolContext, scope: TargetScope): Promise<string[]> {
  if (scope.kind === "vercel") return (await vercelListed(ctx, scope)).map((e) => e.key);
  const result =
    scope.kind === "github"
      ? await run(ctx, "gh", ["secret", "list", "--json", "name", ...scopeArgs(scope)])
      : await run(ctx, "wrangler", ["secret", "list", "--format", "json", ...scopeArgs(scope)]);
  const parsed = parseJson(result.stdout, `${scope.kind} secret list`);
  if (!Array.isArray(parsed)) throw new ToolError(`Could not read the output of ${scope.kind} secret list.`);
  return parsed
    .map((item: { name?: unknown }) => item?.name)
    .filter((name): name is string => typeof name === "string");
}

/**
 * Every user variable in a Vercel environment, in Vercel's order, with its
 * value where Vercel will give it. `vercel env ls` says what exists and what
 * is Sensitive but does not decrypt; `vercel env pull` decrypts but writes a
 * file. So the file goes into a fresh directory only this user can enter,
 * is read into memory, and is deleted before this returns, failure or not.
 */
export async function readVercel(ctx: ToolContext, scope: TargetScope): Promise<VercelVar[]> {
  const listed = await vercelListed(ctx, scope);
  const dir = await mkdtemp(path.join(tmpdir(), "klef-vercel-")); // mode 0700
  let pulled: Map<string, string>;
  try {
    const file = path.join(dir, "pulled.env");
    await run(ctx, "vercel", ["env", "pull", file, "--environment", scope.environment!, "--yes"]);
    pulled = parseVercelPull(await readFile(file, "utf8").catch(() => ""));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return listed.map((e) => {
    const sensitive = e.type === "sensitive" || e.visibility === "secret";
    return { name: e.key, value: sensitive ? null : (pulled.get(e.key) ?? null) };
  });
}

/** Set each name to its value in this scope, creating or overwriting. */
export async function setValues(
  ctx: ToolContext,
  scope: TargetScope,
  entries: Map<string, string>,
): Promise<void> {
  if (scope.kind === "cloudflare") {
    // One request for all of them, as JSON on stdin: no temp file, and the
    // format every wrangler that has `secret bulk` reads.
    const json = JSON.stringify(Object.fromEntries(entries));
    await run(ctx, "wrangler", ["secret", "bulk", ...scopeArgs(scope)], json, entries.values());
    return;
  }
  for (const [name, value] of entries) {
    if (scope.kind === "vercel") {
      await run(ctx, "vercel", ["env", "add", name, scope.environment!, "--force", "--yes"], value, [value]);
    } else {
      await run(ctx, "gh", ["secret", "set", name, ...scopeArgs(scope)], value, [value]);
    }
  }
}
