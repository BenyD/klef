// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Server-side personal access token handling: hashing, bearer parsing, and the
// freshness rules the auth middleware applies. The token *format* is shared
// with the client and lives in src/shared/access-token-format.ts.
//
// Pure and headless so it can be tested in isolation, in the same spirit as
// src/shared/crypto.ts — though note this is not vault crypto: these tokens
// gate access to ciphertext, never to secret values.

import { bytesToBase64, utf8ToBytes } from "../shared/encoding.ts";

export {
  generateToken,
  isTokenShape,
  PREFIX_DISPLAY_LENGTH,
  TOKEN_BYTES,
  TOKEN_PREFIX,
  tokenDisplayPrefix,
} from "../shared/access-token-format.ts";

/**
 * Lookup key for a token. Hashing means a database leak doesn't yield usable
 * tokens; it also makes authentication a single indexed equality lookup rather
 * than a comparison against the secret itself.
 *
 * Plain SHA-256, not Argon2id: the token is 256 bits of uniform randomness, so
 * there is no dictionary to attack and a slow KDF would only add latency to
 * every authenticated request. Argon2id remains correct for the passphrase,
 * which is low-entropy and human-chosen.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", utf8ToBytes(token));
  return bytesToBase64(new Uint8Array(digest));
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
