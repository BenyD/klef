// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Deciding where `pull` is allowed to write.
//
// The threat model in docs/AGENT_ACCESS.md commits to this: a compromised or
// prompt-injected agent calling `klef pull` must not be able to drop plaintext
// secrets anywhere on the filesystem. So a destination is only accepted if it
// stays inside the directory the command was run from. Absolute paths and
// `../` escapes are refused rather than silently resolved.

import path from "node:path";

export class UnsafePathError extends Error {}

/** Shared by pull (writing) and push (reading), so the wording stays neutral. */
const OUTSIDE = "Refusing to leave this directory";

/**
 * Resolve a destination against `cwd`, refusing anything that escapes it.
 * Returns the absolute path to write.
 */
export function resolveWritePath(cwd: string, requested: string): string {
  if (requested.trim() === "") {
    throw new UnsafePathError("Destination path is empty.");
  }

  if (path.isAbsolute(requested)) {
    throw new UnsafePathError(
      `${OUTSIDE}: "${requested}" is an absolute path.`,
    );
  }

  const base = path.resolve(cwd);
  const target = path.resolve(base, requested);

  // path.relative gives "" for the directory itself, and a "../"-prefixed
  // result for anything above it.
  const rel = path.relative(base, target);
  if (rel === "" || rel === ".." || rel.startsWith(`..${path.sep}`)) {
    throw new UnsafePathError(
      `${OUTSIDE}: "${requested}" resolves above ${base}.`,
    );
  }

  return target;
}
