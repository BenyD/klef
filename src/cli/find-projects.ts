// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Finding linked checkouts under a directory, for `restore`. A bounded walk:
// a projects folder is wide but shallow, and the places worth skipping
// (dependencies, build output, hidden directories) are where the depth is.

import { readdir } from "node:fs/promises";
import path from "node:path";
import { CONFIG_FILENAME } from "./project-config.ts";

/** Deep enough for ~/Developer/org/repo/apps/web, shallow enough to be quick. */
export const MAX_DEPTH = 4;

const SKIP = new Set(["node_modules", "dist", "build", "out", "target", "vendor", "Library"]);

/**
 * Every directory under `root` (itself included) holding a `.klef.json`,
 * sorted. Symlinks are not followed, so a link to `/` or back up the tree
 * cannot make the walk loop or leave the directory it was given.
 */
export async function findProjects(root: string, maxDepth: number = MAX_DEPTH): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // Unreadable directories are skipped, not fatal.
    }
    if (entries.some((e) => e.isFile() && e.name === CONFIG_FILENAME)) found.push(dir);
    if (depth >= maxDepth) return;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || SKIP.has(entry.name)) continue;
      await walk(path.join(dir, entry.name), depth + 1);
    }
  }

  await walk(path.resolve(root), 0);
  return found.sort();
}
