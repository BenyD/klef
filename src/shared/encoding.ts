// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Encoding primitives for the crypto contract. Pure, isomorphic (browser /
// workerd / node), no dependencies. See ./BLOB_FORMAT.md.

/**
 * A byte buffer that is statically known to be backed by an `ArrayBuffer` (not
 * a `SharedArrayBuffer`). WebCrypto's `BufferSource` requires this, and TS 5.7+
 * tracks the buffer type in the `Uint8Array` generic — so we standardize on it.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

/** UTF-8 string → bytes. */
export function utf8ToBytes(s: string): Bytes {
  return new TextEncoder().encode(s) as Bytes;
}

/** Bytes → UTF-8 string. */
export function bytesToUtf8(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

/** Bytes → standard (padded) base64. Chunked so large inputs don't overflow the stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Standard (padded) base64 → bytes. */
export function base64ToBytes(b64: string): Bytes {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// --- Crockford Base32 (for the recovery key) -------------------------------
// Alphabet excludes I, L, O, U to avoid transcription errors; decoding is
// case-insensitive and maps the look-alikes (I/L→1, O→0) back.
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const CROCKFORD_DECODE: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (let i = 0; i < CROCKFORD.length; i++) {
    const ch = CROCKFORD[i]!;
    map[ch] = i;
    map[ch.toLowerCase()] = i;
  }
  // Ambiguous-character aliases.
  map["I"] = map["i"] = 1;
  map["L"] = map["l"] = 1;
  map["O"] = map["o"] = 0;
  return map;
})();

/** Bytes → Crockford Base32 (no padding). */
export function bytesToCrockford(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += CROCKFORD[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    out += CROCKFORD[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

/**
 * Crockford Base32 → bytes. Ignores dashes/spaces, case-insensitive. Throws on
 * an invalid character. `byteLength` is the expected output size (the trailing
 * partial group's padding bits are discarded).
 */
export function crockfordToBytes(text: string, byteLength: number): Bytes {
  const clean = text.replace(/[\s-]/g, "");
  const out = new Uint8Array(byteLength);
  let bits = 0;
  let value = 0;
  let index = 0;
  for (const ch of clean) {
    const v = CROCKFORD_DECODE[ch];
    if (v === undefined) throw new Error(`Invalid recovery-key character: ${ch}`);
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      if (index < byteLength) out[index++] = (value >>> bits) & 0xff;
    }
  }
  if (index !== byteLength) {
    throw new Error(`Recovery key decoded to ${index} bytes, expected ${byteLength}`);
  }
  return out;
}
