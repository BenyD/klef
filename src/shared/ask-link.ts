// SPDX-License-Identifier: MIT
//
// The link `klef ask NAME` opens: the app, at one file, with one key to fill.
//
// A coding agent that needs a secret it doesn't have runs `klef ask` instead
// of asking the user to paste the value into chat. The CLI opens this link;
// the app opens that file in the ordinary editor, with the key ready to fill
// in and the agent's reason above it. The user saves a version as always, and
// the CLI, polling the vault, sees the key arrive. Nothing new is stored and
// no value travels anywhere but through the existing encrypted save.
//
// Shared so the CLI that writes the link and the app that reads it agree on
// what is in it. Everything in it is a plaintext name or the agent's own
// words; the reason is shown as text and nothing else.

import { ENV_KEY_RE, parseEnvText } from "./env-table.ts";

/** The reason is shown above the editor; long enough for a sentence, no more. */
export const MAX_ASK_REASON = 140;

/** Variable names are plaintext, but still capped: the page shows them. */
const MAX_ASK_NAME = 128;

export interface AskLink {
  fileId: string;
  name: string;
  reason: string | null;
}

/**
 * The reason as the app shows it: one line, no control characters, capped.
 * Null when nothing is left.
 */
export function cleanAskReason(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const flat = input
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (flat === "") return null;
  return [...flat].slice(0, MAX_ASK_REASON).join("");
}

export function isAskName(name: string): boolean {
  return name.length <= MAX_ASK_NAME && ENV_KEY_RE.test(name);
}

/** The path and query for an ask, under the app's origin. */
export function askLinkPath(link: AskLink): string {
  const query = new URLSearchParams({ file: link.fileId, ask: link.name });
  const reason = cleanAskReason(link.reason);
  if (reason) query.set("reason", reason);
  return `/app?${query.toString()}`;
}

/** An ask from a URL's query, or null if there is none or it is malformed. */
export function parseAskLink(query: URLSearchParams): AskLink | null {
  const fileId = query.get("file");
  const name = query.get("ask");
  if (!fileId || !name || !isAskName(name)) return null;
  return { fileId, name, reason: cleanAskReason(query.get("reason")) };
}

/**
 * Whether `text` gives `name` a value: its last assignment (the one loaders
 * use) is there and not empty. An empty `KEY=`, `KEY=""` or `KEY=''` is still
 * waiting to be filled in.
 */
export function askAnswered(text: string, name: string): boolean {
  const last = parseEnvText(text)
    .filter((l) => l.kind === "entry" && l.key === name)
    .at(-1);
  if (!last || last.kind !== "entry") return false;
  const raw = last.value.trim();
  return raw !== "" && raw !== '""' && raw !== "''";
}
