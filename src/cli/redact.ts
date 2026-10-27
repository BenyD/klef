// SPDX-License-Identifier: AGPL-3.0-or-later
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
 * The values worth masking, longest first so a value that contains another
 * is replaced whole rather than leaving its ends around a marker.
 */
export function redactable(values: Iterable<string>): string[] {
  const set = new Set<string>();
  for (const value of values) {
    if (value.length < MIN_REDACT_LENGTH) continue;
    if (NEVER_SECRET.has(value.toLowerCase())) continue;
    set.add(value);
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
