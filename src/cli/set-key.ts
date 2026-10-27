// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Setting one key in a local env file, as `klef set` and `klef recover` do.
// Pure: text in, text out, editing only that key's line the way the web
// app's table editor does (src/web/lib/env-table.ts), so comments, order and
// every other line stay exactly as they were.

import { appendEntry, ENV_KEY_RE, parseEnvText, setEntry } from "../web/lib/env-table.ts";

export function isKeyName(name: string): boolean {
  return ENV_KEY_RE.test(name);
}

/**
 * The text with `key` set to `rawValue` (already written as it should appear
 * after `=`, quotes and all). An existing key has its last assignment
 * rewritten, which is the one loaders use; a new key is appended.
 */
export function setKey(text: string, key: string, rawValue: string): { text: string; added: boolean } {
  const assignments = parseEnvText(text).filter((l) => l.kind === "entry" && l.key === key);
  const last = assignments.at(-1);
  if (last) return { text: setEntry(text, last.index, { value: rawValue }), added: false };
  return { text: appendEntry(text, key, rawValue), added: true };
}

/** The raw value of a key's last assignment (as written, quotes and all), or null. */
export function rawValueOf(text: string, key: string): string | null {
  const assignments = parseEnvText(text).filter((l) => l.kind === "entry" && l.key === key);
  const last = assignments.at(-1);
  return last && last.kind === "entry" ? last.value : null;
}
