// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Env values as a deploy target sees them. The vault stores raw text, and the
// line parser shared with the web app keeps a value exactly as written:
// `API_URL="https://x" # prod` is the value `"https://x" # prod`. Vercel,
// GitHub and Cloudflare want `https://x`. This module is the one place that
// decodes, so a value means the same thing on the way to every target.
//
// Nothing here is ever printed. The functions take and return values, and
// the callers hand them to a child process's stdin and nowhere else.

import { parseEnvText } from "../web/lib/env-table.ts";

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

/**
 * Values from a file `vercel env pull` wrote. Vercel writes `KEY="value"`
 * and escapes only line breaks, so a quote inside a value is left bare and
 * the value runs to the last quote on the line, and a backslash is literal.
 */
export function parseVercelPull(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_.-]*)=(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rest] = match as unknown as [string, string, string];
    const quoted = rest.length >= 2 && rest.startsWith('"') && rest.endsWith('"');
    const inner = quoted ? rest.slice(1, -1) : rest;
    values.set(key, inner.replace(/\\n/g, "\n").replace(/\\r/g, "\r"));
  }
  return values;
}
