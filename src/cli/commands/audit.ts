// SPDX-License-Identifier: AGPL-3.0-or-later

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { hasFlag, type ParsedArgs } from "../args.ts";
import { CliError, emit, EXIT, say, style } from "../ui.ts";
import { suggest } from "../commands-table.ts";
import {
  auditKey,
  findWorkers,
  groupNames,
  isPlatform,
  listPlatformNames,
  localFileFor,
  platformMissing,
  PLATFORMS,
  readWorkerName,
  SCOPES,
  scopeLabel,
  type AuditScope,
  type NameGroups,
  type Platform,
} from "../audit.ts";
import type { ProjectConfig } from "../project-config.ts";
import { readProjectConfig } from "../project-file.ts";
import { redactAssignments } from "../output.ts";
import { ToolError } from "../run-tool.ts";
import { readWorkflows } from "../workflow-secrets.ts";
import { resolveWritePath } from "../write-path.ts";
import { keysOf } from "../../web/lib/env-drift.ts";

export interface AuditEntry extends Partial<NameGroups> {
  platform: Platform;
  /** Vercel or GitHub environment; null for GitHub repository secrets and Workers. */
  environment: string | null;
  label: string;
  /**
   * What the platform was compared with, relative to this directory: a local
   * env file, or for GitHub ".github/workflows" (what the workflows read).
   */
  file: string;
  /** "file": a local env file. "workflows": GitHub secrets the workflows reference. */
  compareTo: "file" | "workflows";
  /** A Worker's directory ("." for the root), for Cloudflare. */
  worker?: string;
  /**
   * ok: compared. no-local-file: listed only. empty: the platform holds
   * nothing there (an unused environment). skipped: not set up here.
   * unavailable: the tool failed.
   */
  status: "ok" | "no-local-file" | "empty" | "skipped" | "unavailable";
  reason: string | null;
}

/**
 * List which key names Vercel, GitHub Actions and Cloudflare Workers hold
 * that this repository does not use or keep, and the reverse. Read-only,
 * names only, through the user's own CLIs; a platform that is not set up, or
 * whose CLI is missing or signed out, is reported and the rest still run.
 *
 * GitHub is compared with what the workflows reference rather than with
 * .env.production, every Worker under the repository is audited on its own,
 * and a platform environment that holds nothing is one "unused" line rather
 * than every local name. Exits 0 with whatever it found unless --exit-code.
 */
export async function audit(args: ParsedArgs, env: NodeJS.ProcessEnv, cwd: string): Promise<number> {
  const asked = args.positionals[0];
  if (asked !== undefined && !isPlatform(asked)) {
    const guess = suggest(asked, PLATFORMS);
    throw new CliError(
      "usage",
      `Unknown platform "${asked}".${guess ? ` Did you mean "${guess}"?` : ""} Use one of: ${PLATFORMS.join(", ")}.`,
    );
  }
  const entries = await collectAudit(asked ? [asked] : PLATFORMS, cwd, env);
  emit({ targets: entries });
  for (const line of formatAudit(entries)) say(line);
  const differs = entries.some((e) => (e.onlyOnPlatform?.length ?? 0) + (e.onlyLocal?.length ?? 0) > 0);
  return differs && hasFlag(args, "exit-code") ? EXIT.differs : EXIT.ok;
}

/** Every scope of every platform asked for, compared. Shared with `setup`. */
export async function collectAudit(
  platforms: readonly Platform[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<AuditEntry[]> {
  const config = await readProjectConfig(cwd).catch(() => null);
  const entries: AuditEntry[] = [];
  for (const platform of platforms) {
    if (platform === "github") entries.push(...(await auditGithub(cwd, env, config)));
    else if (platform === "cloudflare") entries.push(...(await auditWorkers(cwd, env, config)));
    else entries.push(...(await auditFiles(platform, cwd, env, config)));
  }
  return entries;
}

/** Vercel: each environment against its local file. */
async function auditFiles(platform: Platform, cwd: string, env: NodeJS.ProcessEnv, config: ProjectConfig | null) {
  const missing = platformMissing(platform, cwd);
  const out: AuditEntry[] = [];
  for (const scope of SCOPES[platform]) {
    const file = localFileFor(scope, config);
    const local = await localNames(cwd, file);
    // Preview is only worth a line when the repo keeps a preview file.
    if (scope.environment === "preview" && local === null && !config?.audit?.[auditKey(scope)]) continue;
    const base = { platform, environment: scope.environment, label: scopeLabel(scope), file, compareTo: "file" as const };
    out.push(missing ? { ...base, status: "skipped", reason: missing } : { ...base, ...(await compare(scope, local, { cwd, env })) });
  }
  return out;
}

/**
 * GitHub Actions: the secrets set (repository, plus every deployment
 * environment a workflow runs in) against the secrets the workflows
 * reference. Without workflows, the old comparison with .env.production.
 */
async function auditGithub(cwd: string, env: NodeJS.ProcessEnv, config: ProjectConfig | null): Promise<AuditEntry[]> {
  const missing = platformMissing("github", cwd);
  const workflows = await readWorkflows(cwd);
  if (missing || !workflows) return auditFiles("github", cwd, env, config);

  const base = {
    platform: "github" as const,
    environment: null,
    label: "GitHub Actions secrets",
    file: ".github/workflows",
    compareTo: "workflows" as const,
  };
  const scopes: AuditScope[] = [
    { platform: "github", environment: null, file: ".env.production" },
    ...workflows.environments.map((e): AuditScope => ({ platform: "github", environment: e, file: ".env.production" })),
  ];
  const set = new Set<string>();
  const notes: string[] = [];
  for (const scope of scopes) {
    try {
      for (const name of await listPlatformNames(scope, { cwd, env })) set.add(name.toUpperCase());
    } catch (err) {
      if (!(err instanceof ToolError)) throw err;
      // A missing environment is worth saying, not fatal; anything else means
      // gh itself is unusable, which the whole entry reports.
      if (scope.environment && /no GitHub environment/.test(err.message)) notes.push(err.message);
      else return [{ ...base, status: "unavailable", reason: redactAssignments(err.message) }];
    }
  }
  const groups = groupNames("github", workflows.secrets, set);
  return [{ ...base, status: "ok", reason: notes.length ? notes.join("; ") : null, ...groups }];
}

/** Cloudflare: every Worker in the repository, each against its own env file. */
async function auditWorkers(cwd: string, env: NodeJS.ProcessEnv, config: ProjectConfig | null): Promise<AuditEntry[]> {
  const workers = await findWorkers(cwd);
  if (workers.length === 0) {
    const scope = SCOPES.cloudflare[0]!;
    return [
      {
        platform: "cloudflare",
        environment: null,
        label: scopeLabel(scope),
        file: localFileFor(scope, config),
        compareTo: "file",
        status: "skipped",
        reason: platformMissing("cloudflare", cwd),
      },
    ];
  }
  const out: AuditEntry[] = [];
  for (const dir of workers) {
    const scope = SCOPES.cloudflare[0]!;
    const workerDir = path.join(cwd, dir);
    const name = readWorkerName(workerDir);
    const file = workerFile(cwd, dir, config, scope);
    const local = await localNames(cwd, file);
    const label = `${scopeLabel(scope, name)}${dir === "." ? "" : ` (${dir})`}`;
    const result = await compare(scope, local, { cwd: workerDir, env, root: cwd });
    out.push({ platform: "cloudflare", environment: null, label, file, compareTo: "file", worker: dir, ...result });
  }
  return out;
}

/**
 * The local file a Worker is compared with: the "audit" map's, else the
 * Worker's own .dev.vars or .env.production, else the repository's
 * production file.
 */
function workerFile(cwd: string, dir: string, config: ProjectConfig | null, scope: AuditScope): string {
  const mapped = config?.audit?.[auditKey(scope, dir)];
  if (mapped) return mapped;
  if (dir !== ".") {
    for (const name of [".dev.vars", ".env.production"]) {
      const candidate = path.join(dir, name);
      if (existsSync(path.join(cwd, candidate))) return candidate;
    }
  }
  return localFileFor(scope, config);
}

/** Key names in a local file, or null when there is none. Values are never kept. */
async function localNames(cwd: string, file: string): Promise<string[] | null> {
  try {
    return keysOf(await readFile(resolveWritePath(cwd, file), "utf8"));
  } catch {
    return null;
  }
}

async function compare(
  scope: AuditScope,
  local: string[] | null,
  ctx: { cwd: string; env: NodeJS.ProcessEnv; root?: string },
): Promise<Pick<AuditEntry, "status" | "reason"> & Partial<NameGroups>> {
  let remote: string[];
  try {
    remote = await listPlatformNames(scope, ctx);
  } catch (err) {
    if (!(err instanceof ToolError)) throw err;
    return { status: "unavailable", reason: redactAssignments(err.message) };
  }
  // Nothing set there: one line, not every local name as "only here".
  if (remote.length === 0 && local !== null) {
    return { status: "empty", reason: "nothing is set there", onlyOnPlatform: [], onlyLocal: [], both: [] };
  }
  const groups = groupNames(scope.platform, local ?? [], remote);
  return local === null
    ? { status: "no-local-file", reason: `no ${scope.file} here`, ...groups }
    : { status: "ok", reason: null, ...groups };
}

/** The human report: one block per scope, names listed, matches counted. */
export function formatAudit(entries: AuditEntry[]): string[] {
  const lines: string[] = [];
  for (const entry of entries) {
    if (lines.length) lines.push("");
    lines.push(`${style.bold(entry.label)}  ${style.dim(`(${entry.file})`)}`);
    if (entry.status === "skipped" || entry.status === "unavailable") {
      const text = `${entry.status === "skipped" ? "skipped" : "could not check"}: ${entry.reason}`;
      lines.push(`  ${entry.status === "skipped" ? style.dim(text) : style.yellow(text)}`);
      continue;
    }
    if (entry.status === "empty") {
      lines.push(`  ${style.dim(`unused environment: ${entry.reason}`)}`);
      continue;
    }
    if (entry.compareTo === "workflows") {
      if (entry.onlyLocal!.length) lines.push(`  referenced in workflows, not set: ${entry.onlyLocal!.join(", ")}`);
      if (entry.onlyOnPlatform!.length) lines.push(`  set, never referenced: ${entry.onlyOnPlatform!.join(", ")}`);
      if (entry.reason) lines.push(`  ${style.dim(entry.reason)}`);
      lines.push(style.dim(`  referenced and set: ${entry.both!.length}`));
      continue;
    }
    const platform = entry.label.split(" ")[0];
    if (entry.status === "no-local-file") lines.push(`  ${entry.reason}`);
    if (entry.onlyOnPlatform!.length) lines.push(`  only on ${platform}: ${entry.onlyOnPlatform!.join(", ")}`);
    if (entry.onlyLocal!.length) lines.push(`  only in ${entry.file}: ${entry.onlyLocal!.join(", ")}`);
    if (entry.status === "ok") lines.push(style.dim(`  in both: ${entry.both!.length}`));
  }
  if (entries.length === 0) lines.push("Nothing to audit here.");
  return lines;
}

/** One line per platform scope, for the end of `setup`: counts, never names. */
export function summarizeAudit(entries: AuditEntry[]): string[] {
  return entries
    .filter((e) => e.status === "ok" || e.status === "empty")
    .map((e) => {
      if (e.status === "empty") return `${e.label}: unused environment`;
      const parts =
        e.compareTo === "workflows"
          ? [e.onlyLocal!.length && `${e.onlyLocal!.length} referenced, not set`, e.onlyOnPlatform!.length && `${e.onlyOnPlatform!.length} never referenced`]
          : [e.onlyOnPlatform!.length && `${e.onlyOnPlatform!.length} only there`, e.onlyLocal!.length && `${e.onlyLocal!.length} only here`];
      const said = parts.filter(Boolean).join(", ");
      return `${e.label}: ${said || "names match"}`;
    });
}
