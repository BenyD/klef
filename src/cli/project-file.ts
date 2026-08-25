// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Reading and writing `.klef.json` on disk. The parsing and validation is pure
// and lives in project-config.ts; this is only the filesystem half.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CONFIG_FILENAME,
  parseProjectConfig,
  serializeProjectConfig,
  type ProjectConfig,
} from "./project-config.ts";

/** The config in `cwd`, or null if this directory isn't linked. */
export async function readProjectConfig(cwd: string): Promise<ProjectConfig | null> {
  try {
    return parseProjectConfig(await readFile(path.join(cwd, CONFIG_FILENAME), "utf8"));
  } catch (err) {
    // A malformed config is a real error worth surfacing; a missing one just
    // means "not linked".
    if (err instanceof Error && "code" in err && err.code === "ENOENT") return null;
    throw err;
  }
}

export async function writeProjectConfig(
  cwd: string,
  config: ProjectConfig,
): Promise<string> {
  const file = path.join(cwd, CONFIG_FILENAME);
  await writeFile(file, serializeProjectConfig(config));
  return file;
}
