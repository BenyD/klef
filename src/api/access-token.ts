// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Personal access token primitives. Pure and headless so they can be tested in
// isolation, in the same spirit as src/shared/crypto.ts — though note this is
// *not* vault crypto: these tokens gate access to ciphertext, they never
// participate in encrypting or unwrapping anything.
//
// Format: "klef_pat_" + base64url(32 random bytes). Shown once at creation;
// only the SHA-256 is persisted. See db/migrations/0012_access_tokens.sql.

import { bytesToBase64, bytesToBase64Url, utf8ToBytes } from "../shared/encoding.ts";

/** Namespaces the token so leak scanners and humans can recognise it on sight. */
export const TOKEN_PREFIX = "klef_pat_";

/** 256 bits of randomness — the reason plain SHA-256 storage is sufficient. */
export const TOKEN_BYTES = 32;

/** base64url of 32 bytes is 43 chars, unpadded. */
const TOKEN_BODY_LENGTH = 43;

/** How much of the random body is stored in the clear, to identify a token in the UI. */
export const PREFIX_DISPLAY_LENGTH = 8;

const BODY_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Mint a new token. The caller must show this to the user exactly once. */
export function generateToken(): string {
  return TOKEN_PREFIX + bytesToBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

/** Cheap structural check, so malformed input never reaches the database. */
export function isTokenShape(token: string): boolean {
  if (!token.startsWith(TOKEN_PREFIX)) return false;
  const body = token.slice(TOKEN_PREFIX.length);
  return body.length === TOKEN_BODY_LENGTH && BODY_PATTERN.test(body);
}

/**
 * Lookup key for a token. Hashing means a database leak doesn't yield usable
 * tokens; it also makes authentication a single indexed equality lookup rather
 * than a comparison against the secret itself.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", utf8ToBytes(token));
  return bytesToBase64(new Uint8Array(digest));
}

/** The identifying fragment shown in the UI, e.g. "aB3xK9_p". */
export function tokenDisplayPrefix(token: string): string {
  return token.slice(TOKEN_PREFIX.length, TOKEN_PREFIX.length + PREFIX_DISPLAY_LENGTH);
}

/**
 * Extract a bearer credential. Returns the raw credential for *any* Bearer
 * header, not just ours: a caller that presents a bearer is attempting token
 * auth, and should be told it failed rather than silently falling through to
 * cookie auth and getting a confusing 401.
 */
export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer[ \t]+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/** ISO 8601 strings sort lexicographically, but compare as dates for clarity. */
export function isExpired(expiresAt: string | null, now: Date): boolean {
  if (expiresAt === null) return false;
  const at = Date.parse(expiresAt);
  return Number.isNaN(at) || at <= now.getTime();
}

/**
 * Writing `last_used_at` on every request would put a D1 write in the hot path
 * of every CLI call for a field nobody reads at that resolution. An hour is
 * precise enough to answer "is this token still in use?".
 */
export const LAST_USED_THROTTLE_MS = 60 * 60 * 1000;

export function shouldTouchLastUsed(lastUsedAt: string | null, now: Date): boolean {
  if (lastUsedAt === null) return true;
  const at = Date.parse(lastUsedAt);
  if (Number.isNaN(at)) return true;
  return now.getTime() - at >= LAST_USED_THROTTLE_MS;
}
