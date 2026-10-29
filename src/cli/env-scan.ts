// SPDX-License-Identifier: MIT
//
// Finding env files in a checkout that `.klef.json` does not list, for
// `klef scan`: in a monorepo, apps/web/.env.local is easy to miss. Names and
// paths only; no file is opened.

import { readdir } from "node:fs/promises";
import path from "node:path";
import { allFiles, type ProjectConfig } from "./project-config.ts";
import { runTool } from "./run-tool.ts";

/** .env, .env.local, .env.production, app.env... but not the committed templates. */
export function isEnvFileName(name: string): boolean {
  if (/\.(example|sample|template|dist|defaults|schema)$/i.test(name)) return false;
  if (/^\.env\.(example|sample|template)\./i.test(name)) return false;
  return /^\.env(\.[\w.-]+)?$/.test(name) || /^[\w.-]+\.env$/.test(name);
}

const SKIP = new Set(["node_modules", ".git", "dist", "build", "out", ".next", ".turbo", "vendor", "target"]);

/** Env-like files under `root`, as relative paths, sorted. Bounded and symlink-free. */
export async function findEnvFiles(root: string, maxDepth = 5): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isFile() && isEnvFileName(e.name)) found.push(path.relative(root, path.join(dir, e.name)));
      if (e.isDirectory() && depth < maxDepth && !SKIP.has(e.name) && !e.name.startsWith(".")) {
        await walk(path.join(dir, e.name), depth + 1);
      }
    }
  }
  await walk(root, 0);
  return found.sort();
}

/**
 * Which of `paths` git ignores, or null outside a git repository (or without
 * git). `git check-ignore` exits 1 when none are ignored, which is an answer.
 */
export async function gitIgnored(root: string, paths: string[], env: NodeJS.ProcessEnv): Promise<Set<string> | null> {
  if (paths.length === 0) return new Set();
  try {
    const result = await runTool("git", ["check-ignore", "--", ...paths], { cwd: root, env });
    if (result.code > 1) return null;
    return new Set(result.stdout.split("\n").map((l) => l.trim()).filter(Boolean));
  } catch {
    return null;
  }
}

export interface ScanResult {
  /** Env files here that `.klef.json` does not list. */
  unlisted: { path: string; ignored: boolean | null }[];
  /** Listed files that exist here. */
  listed: string[];
}

export function scanAgainst(config: ProjectConfig | null, found: string[], ignored: Set<string> | null): ScanResult {
  const listedPaths = new Set((config ? allFiles(config) : []).map((e) => path.normalize(e.path)));
  return {
    unlisted: found
      .filter((p) => !listedPaths.has(path.normalize(p)))
      .map((p) => ({ path: p, ignored: ignored ? ignored.has(p) : null })),
    listed: found.filter((p) => listedPaths.has(path.normalize(p))),
  };
}

/**
 * The vault name `link --add` gives a path: a file at the root keeps its own
 * name; one in a folder gets the folder's name in front, so the vault says
 * which app it belongs to (apps/mobile/.env.local becomes mobile.env.local,
 * apps/api/.env becomes api.env). Null when that name is taken; `--as` then.
 */
export function vaultNameFor(localPath: string, taken: string[]): string | null {
  const lower = new Set(taken.map((t) => t.toLowerCase()));
  const base = path.basename(localPath);
  const folder = path.basename(path.dirname(localPath));
  const name = !folder || folder === "." ? base : `${folder}${base.startsWith(".") ? base : `.${base}`}`;
  return lower.has(name.toLowerCase()) ? null : name;
}
