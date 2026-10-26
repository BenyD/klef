// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Which files a pull or push covers. Pure: the flags and `.klef.json` in, a
// list of (vault name, local path) out, so `--all` and its edge cases are
// tested without a vault.

import { CliError } from "./ui.ts";
import { allFiles, localPathFor, type ProjectConfig } from "./project-config.ts";

export interface SyncTarget {
  /** The file's name in the vault. */
  file: string;
  /**
   * Where it lives locally, relative to cwd. Null means "the file's own
   * name", which pull takes from the vault's casing and push from the request.
   */
  path: string | null;
}

export class UsageError extends CliError {
  constructor(message: string) {
    super("usage", message);
  }
}

export function syncTargets(
  config: ProjectConfig,
  options: { all: boolean; file: string | null; path: string | null },
): SyncTarget[] {
  if (options.all) {
    if (options.file || options.path) {
      throw new UsageError(
        "--all covers every file in .klef.json, so it takes no --file or --path.",
      );
    }
    return allFiles(config);
  }

  const file = options.file ?? config.file;
  return [{ file, path: options.path ?? localPathFor(config, file) }];
}
