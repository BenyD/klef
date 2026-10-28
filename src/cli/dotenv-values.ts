// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Env values as a program sees them. The vault stores raw text, and the line
// parser shared with the web app keeps a value exactly as written:
// `API_URL="https://x" # prod` is the value `"https://x" # prod`; a program
// run with the file loaded wants `https://x`. This module is the one place
// that decodes, the way dotenv loaders do, so `klef run` and anything after it
// agree on what a value is.
//
// Nothing here is ever printed. The functions take and return values, and
// the callers hand them to a child process's environment and nowhere else.

import { parseEnvText } from "../shared/env-table.ts";

/**
 * A raw value as dotenv loaders read it: double quotes with `\n`-style
 * escapes, single quotes and backticks literal, and an unquoted value ending
 * at an inline ` #` comment.
 */
export function decodeValue(raw: string): string {
  const value = raw.trim();
  const quote = value[0];
  if (quote === '"' || quote === "'" || quote === "`") {
    const end = value.lastIndexOf(quote);
    if (end > 0) {
      const inner = value.slice(1, end);
      if (quote !== '"') return inner;
      return inner.replace(/\\([nrt"\\])/g, (_, c: string) =>
        c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c,
      );
    }
  }
  const comment = value.search(/\s#/);
  return (comment === -1 ? value : value.slice(0, comment)).trim();
}

/** Every key with its decoded value, in first-seen order; the last assignment wins, as in loaders. */
export function envEntries(text: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of parseEnvText(text)) {
    if (line.kind === "entry") entries.set(line.key, decodeValue(line.value));
  }
  return entries;
}

/** A value written so `decodeValue` reads it back unchanged. */
export function encodeValue(value: string): string {
  if (/^[A-Za-z0-9_\-.,:/@+%=~?&]*$/.test(value)) return value;
  // Single quotes are literal, so nothing inside them is expanded or
  // unescaped later; only a value holding one, or a line break, needs more.
  if (!/['\n\r]/.test(value)) return `'${value}'`;
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
  return `"${escaped}"`;
}

/** A well-formed env file from ordered entries, one assignment a line. */
export function formatEnvText(entries: Iterable<[string, string]>): string {
  let text = "";
  for (const [key, value] of entries) text += `${key}=${encodeValue(value)}\n`;
  return text;
}
