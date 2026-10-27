// SPDX-License-Identifier: AGPL-3.0-or-later
//
// What a process would see if an env file were loaded: dotenv's rules, so
// `klef run` gives an app the same variables `klef pull` followed by the
// framework's own .env loading would. Pure, on the same line parser as the
// web app's table editor, so "key" means the same thing everywhere.

import { parseEnvText } from "../web/lib/env-table.ts";

// A value in matching quotes (dotenv's grammar: a backslash escapes the quote
// inside), optionally followed by a comment. Newlines are allowed inside the
// quotes, which is how a multi-line value is recognised once its lines are
// joined back together.
const QUOTED_RE = /^\s*('(?:\\'|[^'])*'|"(?:\\"|[^"])*"|`(?:\\`|[^`])*`)\s*(?:#.*)?$/;

/**
 * The variables an env file defines, as values a process would see: quotes
 * removed, `\n` and `\r` expanded inside double quotes, an unquoted value cut
 * at its first `#`, a quoted value allowed to span lines. A key defined twice
 * takes the last value, as dotenv does.
 */
export function envValues(text: string): Map<string, string> {
  const lines = parseEnvText(text.replace(/\r\n/g, "\n"));
  const values = new Map<string, string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.kind !== "entry") continue;
    let raw = line.value;

    const quote = raw.trimStart()[0];
    if ((quote === '"' || quote === "'" || quote === "`") && !QUOTED_RE.test(raw)) {
      // Possibly a value that continues on later lines: join them until the
      // quote closes. If it never does, the line is read on its own, as
      // dotenv would.
      let joined = raw;
      for (let j = i + 1; j < lines.length; j++) {
        joined += `\n${lines[j]!.raw}`;
        if (QUOTED_RE.test(joined)) {
          raw = joined;
          i = j;
          break;
        }
      }
    }

    values.set(line.key, unquote(raw));
  }
  return values;
}

/** One raw value as a process sees it. */
export function unquote(raw: string): string {
  const quoted = QUOTED_RE.exec(raw);
  if (quoted) {
    const inner = quoted[1]!.slice(1, -1);
    return quoted[1]!.startsWith('"') ? inner.replace(/\\n/g, "\n").replace(/\\r/g, "\r") : inner;
  }
  const comment = raw.indexOf("#");
  return (comment === -1 ? raw : raw.slice(0, comment)).trim();
}
