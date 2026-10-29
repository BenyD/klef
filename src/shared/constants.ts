// SPDX-License-Identifier: MIT
//
// Klef crypto contract — canonical parameters.
//
// This file is the single source of truth for every cryptographic constant in
// Klef. It is written to be reimplemented in another language later (a future
// Go CLI) against the same wire format. Treat every value here as part of a
// versioned, documented contract — see ./BLOB_FORMAT.md.
//
// Nothing in this file is secret. Salts, nonces, and KDF parameters are all
// stored in plaintext alongside ciphertext; their job is uniqueness and
// reproducibility, not confidentiality.

/** Bumped whenever the on-disk blob shape or crypto choices change. */
export const BLOB_FORMAT_VERSION = 1 as const;
export type BlobFormatVersion = typeof BLOB_FORMAT_VERSION;

/**
 * Key derivation. Argon2id is preferred (OWASP 2025). PBKDF2 is the WASM-free
 * fallback. The chosen `id` + `params` are stored per-account so the cost can
 * be raised later without breaking existing vaults.
 */
export const KDF = {
  argon2id: {
    id: "argon2id" as const,
    /** Argon2 memory cost, in KiB. 19456 KiB = 19 MiB (OWASP floor). */
    memoryKiB: 19456,
    /** Time cost (passes). Tune upward toward a ~250–500ms unlock. */
    iterations: 2,
    /** Parallelism. 1 is correct for single-threaded browser WASM. */
    parallelism: 1,
    /** Derived key length in bytes → 32 = AES-256 key. */
    hashLengthBytes: 32,
    /** Random salt length in bytes. */
    saltBytes: 16,
  },
  pbkdf2: {
    id: "pbkdf2-sha256" as const,
    hash: "SHA-256" as const,
    /** OWASP 2025 recommendation for HMAC-SHA-256. */
    iterations: 600_000,
    hashLengthBytes: 32,
    saltBytes: 16,
  },
} as const;

export type KdfId = typeof KDF.argon2id.id | typeof KDF.pbkdf2.id;

/** Symmetric encryption: AES-256-GCM with a fresh 96-bit nonce per operation. */
export const AES = {
  name: "AES-GCM" as const,
  /** 12 bytes (96 bits) — the AES-GCM spec-recommended IV size. */
  nonceBytes: 12,
  /** 32 bytes → AES-256. */
  keyBytes: 32,
  /** GCM auth tag length in bits (WebCrypto default, appended to ciphertext). */
  tagBits: 128,
} as const;

/** Recovery key: 128-bit CSPRNG material, shown once, Crockford-Base32 encoded. */
export const RECOVERY_KEY = {
  /** 16 bytes = 128 bits of entropy. */
  entropyBytes: 16,
  /** Human-facing prefix, e.g. KLEF-XXXXX-XXXXX-... */
  prefix: "KLEF" as const,
  /** Characters per dash-separated group in the displayed code. */
  groupSize: 5,
} as const;
