// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The device-login codes, shared by the Worker that issues them and the CLI
// that presents them.
//
// Two codes with different jobs. The *device code* is the CLI's secret: long,
// random, never shown to anyone, and only its hash is stored. The *user code*
// is short and read aloud by eye - the terminal prints it, the approval page
// shows it, and a person compares the two before approving. That comparison is
// the only thing standing between this flow and someone getting their own
// login approved by a stranger, so the alphabet avoids characters that are
// easy to misread.

import { bytesToBase64Url } from "./encoding.ts";

/** Excludes I, L, O, U, 0, 1 - the pairs people transcribe wrongly. */
const USER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

/** Two groups of four, hyphenated: WDJB-MJHT. */
const USER_CODE_GROUP = 4;
const USER_CODE_GROUPS = 2;

/** 256 bits, like an access token, so a hash is enough to store. */
export const DEVICE_CODE_BYTES = 32;

/** How long a pending authorization lives. Short: it is a live approval. */
export const DEVICE_CODE_TTL_MS = 10 * 60 * 1000;

/** How often the CLI should poll, per RFC 8628's `interval`. */
export const DEVICE_POLL_INTERVAL_MS = 2000;

export function generateDeviceCode(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(DEVICE_CODE_BYTES)));
}

export function generateUserCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(USER_CODE_GROUP * USER_CODE_GROUPS));
  const chars = [...bytes].map((b) => USER_CODE_ALPHABET[b % USER_CODE_ALPHABET.length]!);
  const groups: string[] = [];
  for (let i = 0; i < chars.length; i += USER_CODE_GROUP) {
    groups.push(chars.slice(i, i + USER_CODE_GROUP).join(""));
  }
  return groups.join("-");
}

/** Accepts what a person typed: any case, hyphen optional, spaces ignored. */
export function normalizeUserCode(input: string): string | null {
  const bare = input.toUpperCase().replace(/[\s-]/g, "");
  if (bare.length !== USER_CODE_GROUP * USER_CODE_GROUPS) return null;
  if (![...bare].every((c) => USER_CODE_ALPHABET.includes(c))) return null;
  const groups: string[] = [];
  for (let i = 0; i < bare.length; i += USER_CODE_GROUP) {
    groups.push(bare.slice(i, i + USER_CODE_GROUP));
  }
  return groups.join("-");
}

export function isDeviceCodeShape(code: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(code);
}
