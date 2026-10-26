// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Which key names a deploy platform holds that a local env file does not, and
// the other way round. Read-only on every side: klef lists through the user's
// own `vercel`, `gh` and `wrangler` and never writes to any of them.
//
// Names only. A Vercel listing carries the values of variables that are not
// Sensitive; they are dropped while parsing and go nowhere. The point is a
// list an agent can read and turn into a question for a person ("X is on
// Vercel Production but not in .env.production; still needed?").

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { failureLine, runTool, ToolError } from "./run-tool.ts";

export const PLATFORMS = ["vercel", "github", "cloudflare"] as const;
export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

/** One place names live on a platform, and the local file it is compared with. */
export interface AuditScope {
  platform: Platform;
  /** Vercel environment, GitHub environment (null: repository secrets), or null for a Worker. */
  environment: string | null;
  /** The local file the scope corresponds to, by its conventional name. */
  file: string;
}

/**
 * The scopes each platform is audited in. `.env.local` is development, so it
 * is compared with Vercel Development only; GitHub Actions and Workers run
 * production, so they are compared with `.env.production`. GitHub is checked
 * at both levels a workflow can read: the `production` environment and the
 * repository.
 */
export const SCOPES: Record<Platform, AuditScope[]> = {
  vercel: [
    { platform: "vercel", environment: "development", file: ".env.local" },
    { platform: "vercel", environment: "preview", file: ".env.preview" },
    { platform: "vercel", environment: "production", file: ".env.production" },
  ],
  github: [
    { platform: "github", environment: "production", file: ".env.production" },
    { platform: "github", environment: null, file: ".env.production" },
  ],
  cloudflare: [{ platform: "cloudflare", environment: null, file: ".env.production" }],
};

export function scopeLabel(scope: AuditScope, worker: string | null = null): string {
  if (scope.platform === "vercel") {
    const env = scope.environment ?? "";
    return `Vercel ${env.charAt(0).toUpperCase()}${env.slice(1)}`;
  }
  if (scope.platform === "github") {
    return scope.environment
      ? `GitHub environment "${scope.environment}" secrets`
      : "GitHub repository secrets";
  }
  return worker ? `Cloudflare Worker "${worker}"` : "Cloudflare Worker";
}

export interface NameGroups {
  /** On the platform, not in the local file. */
  onlyOnPlatform: string[];
  /** In the local file, not on the platform. */
  onlyLocal: string[];
  /** In both, by the local file's spelling. */
  both: string[];
}

/** GitHub upper-cases secret names and matches them case-insensitively; the others match exactly. */
export function groupNames(platform: Platform, local: Iterable<string>, remote: Iterable<string>): NameGroups {
  const key = (name: string) => (platform === "github" ? name.toUpperCase() : name);
  const here = [...new Set(local)];
  const there = [...new Set(remote)];
  const hereKeys = new Set(here.map(key));
  const thereKeys = new Set(there.map(key));
  const sorted = (names: string[]) => names.sort((a, b) => a.localeCompare(b));
  return {
    onlyOnPlatform: sorted(there.filter((n) => !hereKeys.has(key(n)))),
    onlyLocal: sorted(here.filter((n) => !thereKeys.has(key(n)))),
    both: sorted(here.filter((n) => thereKeys.has(key(n)))),
  };
}

/** Why a platform is not checked here, or null when it is set up. */
export function platformMissing(platform: Platform, cwd: string): string | null {
  const has = (file: string) => existsSync(path.join(cwd, file));
  if (platform === "vercel") {
    return has(".vercel/project.json") ? null : "not linked here (no .vercel/project.json; run `vercel link`)";
  }
  if (platform === "github") return has(".git") ? null : "not a git repository";
  return ["wrangler.jsonc", "wrangler.json", "wrangler.toml"].some(has)
    ? null
    : "no wrangler.jsonc, wrangler.json or wrangler.toml here";
}

/**
 * The Worker name in the wrangler config, for the label only (wrangler
 * resolves the real one itself). The first top-level `name` is taken, which
 * is where wrangler's own templates put it.
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

/** JSON from a tool's stdout, tolerating a banner before it. The output itself is never quoted. */
function parseJson(stdout: string, what: string): unknown {
  const start = stdout.search(/[[{]/);
  try {
    return JSON.parse(start === -1 ? stdout : stdout.slice(start));
  } catch {
    throw new ToolError(`Could not read the output of ${what}.`);
  }
}

function namesOf(items: unknown, field: string, what: string): string[] {
  if (!Array.isArray(items)) throw new ToolError(`Could not read the output of ${what}.`);
  return items
    .map((item) => (typeof item === "object" && item !== null ? (item as Record<string, unknown>)[field] : null))
    .filter((name): name is string => typeof name === "string");
}

/** wrangler is usually a dev dependency rather than a global install. */
function binary(cwd: string, name: string): string {
  const local = path.join(cwd, "node_modules", ".bin", name);
  return name === "wrangler" && existsSync(local) ? local : name;
}

/** The key names a platform holds in a scope. Throws ToolError with a printable reason. */
export async function listPlatformNames(
  scope: AuditScope,
  ctx: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<string[]> {
  const [tool, args, what] =
    scope.platform === "vercel"
      ? ["vercel", ["env", "ls", scope.environment!, "--format", "json"], "vercel env ls"]
      : scope.platform === "github"
        ? [
            "gh",
            ["secret", "list", "--json", "name", ...(scope.environment ? ["--env", scope.environment] : [])],
            "gh secret list",
          ]
        : ["wrangler", ["secret", "list", "--format", "json"], "wrangler secret list"];

  const result = await runTool(binary(ctx.cwd, tool), args, ctx);
  if (result.code !== 0) {
    if (scope.platform === "github" && scope.environment && result.stderr.includes("HTTP 404")) {
      throw new ToolError(`no GitHub environment "${scope.environment}" in this repository`);
    }
    throw new ToolError(`\`${what}\` failed: ${failureLine(result)}`);
  }
  const parsed = parseJson(result.stdout, what);

  if (scope.platform !== "vercel") return namesOf(parsed, "name", what);
  // Vercel's own system variables (VERCEL_URL and the like) are not the user's.
  const envs = (parsed as { envs?: unknown }).envs;
  if (!Array.isArray(envs)) throw new ToolError(`Could not read the output of ${what}.`);
  const user = envs.filter((e) => (e as { type?: unknown })?.type !== "system");
  return [...new Set(namesOf(user, "key", what))];
}
