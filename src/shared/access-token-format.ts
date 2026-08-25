// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The personal access token *format*, shared by the client (which renders a
// token's identifying prefix) and the Worker (which mints and validates them).
// Pure and dependency-light, like the rest of src/shared.
//
// This is not vault crypto: these tokens gate access to ciphertext and
// plaintext names. They never participate in encrypting or unwrapping
// anything, and a stolen one cannot reveal a secret value.
//
// Format: "klef_pat_" + base64url(32 random bytes).

import { bytesToBase64Url } from "./encoding.ts";

/** Namespaces the token so leak scanners and humans recognise it on sight. */
export const TOKEN_PREFIX = "klef_pat_";

/** 256 bits of randomness — the reason plain SHA-256 storage is sufficient. */
export const TOKEN_BYTES = 32;

/** base64url of 32 bytes is 43 chars, unpadded. */
const TOKEN_BODY_LENGTH = 43;

/** How much of the random body is stored in the clear, to identify a token. */
export const PREFIX_DISPLAY_LENGTH = 8;

const BODY_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Mint a token. The caller must show this to the user exactly once. */
export function generateToken(): string {
  return (
    TOKEN_PREFIX + bytesToBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)))
  );
}

/** Cheap structural check, so malformed input never reaches the database. */
export function isTokenShape(token: string): boolean {
  if (!token.startsWith(TOKEN_PREFIX)) return false;
  const body = token.slice(TOKEN_PREFIX.length);
  return body.length === TOKEN_BODY_LENGTH && BODY_PATTERN.test(body);
}

/** The identifying fragment shown in the UI, e.g. "aB3xK9_p". */
export function tokenDisplayPrefix(token: string): string {
  return token.slice(TOKEN_PREFIX.length, TOKEN_PREFIX.length + PREFIX_DISPLAY_LENGTH);
}
