// SPDX-License-Identifier: AGPL-3.0-or-later
//
// What the CLI is allowed to say.
//
// The rule this module exists to enforce: **no Klef command ever writes a
// secret value to stdout or stderr.** Not behind a flag, not in a debug mode.
// The CLI is expected to be driven by coding agents, and anything it prints
// lands in a model's context window and in a transcript. So `pull` reports a
// count, `diff` reports a shape, and neither has a code path that can print a
// value. See docs/AGENT_ACCESS.md.

// Shared with the web app deliberately. These are pure string functions with
// no DOM dependency; they belong in src/shared once the CLI needs more of
// them, but a cli -> web import beats a divergent second parser today.
import { keysOf } from "../web/lib/env-drift.ts";

/** Result of writing an env file, with nothing from inside it. */
export interface WriteSummary {
  path: string;
  variableCount: number;
}

export function describeWrite({ path, variableCount }: WriteSummary): string {
  const noun = variableCount === 1 ? "variable" : "variables";
  return `Wrote ${variableCount} ${noun} to ${path}`;
}

/**
 * How many variables a file defines, for the "wrote n variables" line.
 *
 * Delegates to the same `keysOf` the web app uses rather than parsing env text
 * a second time: a CLI that counted differently from the UI would be a bug
 * with no upside. Only the count escapes this function — never a key, never a
 * value.
 */
export function countVariables(envText: string): number {
  return keysOf(envText).length;
}

/** What a push would change, in shape only. */
export interface PushSummary {
  variableCount: number;
  added: number;
  removed: number;
}

/**
 * Describe a pending push without quoting a line of it. Line-level adds and
 * removals are what the diff produces; an edited line shows as one of each,
 * which is why this says "lines" rather than claiming to count edits.
 */
export function describePush({ variableCount, added, removed }: PushSummary): string {
  const vars = `${variableCount} ${variableCount === 1 ? "variable" : "variables"}`;
  if (added === 0 && removed === 0) return `${vars}, no line changes`;
  const parts: string[] = [];
  if (added) parts.push(`+${added}`);
  if (removed) parts.push(`-${removed}`);
  return `${vars} (${parts.join(" ")} lines)`;
}

/**
 * Redact anything that looks like an env assignment. A backstop for error
 * paths: if a message ever carries a line out of a file, the value is stripped
 * before it reaches a terminal. Nothing should rely on this instead of simply
 * not printing values.
 */
export function redactAssignments(text: string): string {
  return text.replace(
    /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=).*$/gm,
    "$1<redacted>",
  );
}
