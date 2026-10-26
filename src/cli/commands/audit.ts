// SPDX-License-Identifier: AGPL-3.0-or-later

import { readFile } from "node:fs/promises";
import { hasFlag, type ParsedArgs } from "../args.ts";
import {
  groupNames,
  isPlatform,
  listPlatformNames,
  platformMissing,
  PLATFORMS,
  readWorkerName,
  SCOPES,
  scopeLabel,
  type AuditScope,
  type NameGroups,
  type Platform,
} from "../audit.ts";
import { localPathFor } from "../project-config.ts";
import { readProjectConfig } from "../project-file.ts";
import { redactAssignments } from "../output.ts";
import { ToolError } from "../run-tool.ts";
import { resolveWritePath } from "../write-path.ts";
import { keysOf } from "../../web/lib/env-drift.ts";

export interface AuditEntry extends Partial<NameGroups> {
  platform: Platform;
  /** Vercel or GitHub environment; null for GitHub repository secrets and Workers. */
  environment: string | null;
  label: string;
  /** The local file compared, relative to this directory. */
  file: string;
  /** ok: compared. no-local-file: listed only. skipped: not set up here. unavailable: the tool failed. */
  status: "ok" | "no-local-file" | "skipped" | "unavailable";
  reason: string | null;
}

/**
 * List which key names Vercel, GitHub Actions and Cloudflare Workers hold
 * that this directory's env files do not, and the reverse. Read-only, names
 * only, through the user's own CLIs. A platform that is not set up here, or
 * whose CLI is missing or signed out, is reported as such and the rest still
 * run. Exits 0 with whatever it found; differences are the answer.
 *
 * Nothing here needs the vault: the local files are read for key names, and
 * the platforms are asked for theirs.
 */
export async function audit(args: ParsedArgs, env: NodeJS.ProcessEnv, cwd: string): Promise<number> {
  const asked = args.positionals[0];
  if (asked !== undefined && !isPlatform(asked)) {
    console.error(`Unknown platform "${asked}". Use one of: ${PLATFORMS.join(", ")}.`);
    return 1;
  }
  const platforms: readonly Platform[] = asked ? [asked] : PLATFORMS;
  const config = await readProjectConfig(cwd).catch(() => null);
  const worker = readWorkerName(cwd);

  const entries: AuditEntry[] = [];
  for (const platform of platforms) {
    const missing = platformMissing(platform, cwd);
    for (const scope of SCOPES[platform]) {
      const file = (config && localPathFor(config, scope.file)) ?? scope.file;
      const local = await localNames(cwd, file);
      // Preview is only worth a line when the repo keeps a preview file.
      if (scope.environment === "preview" && local === null) continue;
      const base = { platform, environment: scope.environment, label: scopeLabel(scope, worker), file };
      if (missing) {
        entries.push({ ...base, status: "skipped", reason: missing });
        continue;
      }
      entries.push({ ...base, ...(await compare(scope, local, { cwd, env })) });
    }
  }

  if (hasFlag(args, "json")) {
    console.log(JSON.stringify({ targets: entries }, null, 2));
    return 0;
  }
  for (const line of formatAudit(entries)) console.log(line);
  return 0;
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
  ctx: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<Pick<AuditEntry, "status" | "reason"> & Partial<NameGroups>> {
  let remote: string[];
  try {
    remote = await listPlatformNames(scope, ctx);
  } catch (err) {
    if (!(err instanceof ToolError)) throw err;
    return { status: "unavailable", reason: redactAssignments(err.message) };
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
    lines.push(`${entry.label}  (${entry.file})`);
    if (entry.status === "skipped" || entry.status === "unavailable") {
      lines.push(`  ${entry.status === "skipped" ? "skipped" : "could not check"}: ${entry.reason}`);
      continue;
    }
    const platform = entry.label.split(" ")[0];
    if (entry.status === "no-local-file") lines.push(`  ${entry.reason}`);
    if (entry.onlyOnPlatform!.length) {
      lines.push(`  only on ${platform}: ${entry.onlyOnPlatform!.join(", ")}`);
    }
    if (entry.onlyLocal!.length) lines.push(`  only in ${entry.file}: ${entry.onlyLocal!.join(", ")}`);
    if (entry.status === "ok") lines.push(`  in both: ${entry.both!.length}`);
  }
  if (entries.length === 0) lines.push("Nothing to audit here.");
  return lines;
}
