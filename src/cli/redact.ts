// SPDX-License-Identifier: MIT
//
// Masking secret values in a stream of text, for `klef run`. The app gets
// the real values; whatever reads its output (a terminal, a log, a coding
// agent's context window) gets a marker where each value was. Pure, so the
// chunk-boundary cases are tested without a child process.

/** What stands in for a value in forwarded output. */
export const REDACTED = "[klef:redacted]";

/**
 * Values shorter than this are left alone. Masking `1`, `true` or a port
 * number would replace them in every line of output that happens to contain
 * those characters, which makes the output useless without protecting
 * anything.
 */
export const MIN_REDACT_LENGTH = 5;

/** Settings that are never secret, whatever their length. */
const NEVER_SECRET = new Set([
  "true",
  "false",
  "null",
  "undefined",
  "development",
  "production",
  "staging",
  "test",
  "localhost",
]);

/**
 * The common ways a program re-encodes a value it prints: a logger escaping
 * it into JSON, a URL builder percent-encoding it, an auth header or a debug
 * dump in base64 or hex. Masking only the exact text would let any of these
 * through. Not every transformation can be caught (a value reversed, split,
 * or folded into a larger base64 string still gets out), which is why `run`
 * says so; these are the ones that happen by accident.
 */
function encodings(value: string): string[] {
  const bytes = Buffer.from(value, "utf8");
  const base64 = bytes.toString("base64").replace(/=+$/, "");
  return [
    JSON.stringify(value).slice(1, -1),
    encodeURIComponent(value),
    base64,
    base64.replace(/\+/g, "-").replace(/\//g, "_"),
    bytes.toString("hex"),
  ];
}

/**
 * The values worth masking, with their encoded forms and, for a multi-line
 * value such as a PEM key, each of its lines (output is matched a line at a
 * time, so a value spanning lines would never match whole). Longest first, so
 * a value that contains another is replaced whole rather than leaving its
 * ends around a marker.
 */
export function redactable(values: Iterable<string>): string[] {
  const set = new Set<string>();
  const add = (text: string) => {
    if (text.length < MIN_REDACT_LENGTH) return;
    if (NEVER_SECRET.has(text.toLowerCase())) return;
    set.add(text);
  };
  for (const value of values) {
    if (value.length < MIN_REDACT_LENGTH || NEVER_SECRET.has(value.toLowerCase())) continue;
    add(value);
    for (const encoded of encodings(value)) add(encoded);
    if (/[\r\n]/.test(value)) for (const line of value.split(/\r?\n/)) add(line.trim());
  }
  return [...set].sort((a, b) => b.length - a.length);
}

export interface Redactor {
  /**
   * Take a chunk of the stream and return what can be forwarded now: every
   * complete line, redacted. The partial line after the last newline is held,
   * because a value could straddle this chunk and the next.
   */
  write(chunk: string): string;
  /** Everything held, redacted: at the end, or when the stream has gone quiet. */
  flush(): string;
  /** How many values have been replaced so far. */
  readonly redactions: number;
}

/** A redactor for one stream. `values` are already filtered by `redactable`. */
export function createRedactor(values: readonly string[], marker = REDACTED): Redactor {
  let held = "";
  let redactions = 0;

  const redact = (text: string): string => {
    for (const value of values) {
      const parts = text.split(value);
      if (parts.length === 1) continue;
      redactions += parts.length - 1;
      text = parts.join(marker);
    }
    return text;
  };

  return {
    write(chunk) {
      held += chunk;
      // \r too: a progress bar rewrites its line without ever sending \n.
      const cut = Math.max(held.lastIndexOf("\n"), held.lastIndexOf("\r"));
      if (cut === -1) return "";
      const out = redact(held.slice(0, cut + 1));
      held = held.slice(cut + 1);
      return out;
    },
    flush() {
      const out = redact(held);
      held = "";
      return out;
    },
    get redactions() {
      return redactions;
    },
  };
}
