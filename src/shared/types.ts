// SPDX-License-Identifier: MIT
//
// Klef crypto contract — wire types. See ./BLOB_FORMAT.md for the prose spec.
// All binary fields are base64 (standard, padded) unless noted.

import type { BlobFormatVersion, KdfId } from "./constants.ts";

/**
 * An encrypted env blob, exactly as stored in `env_versions.ciphertext`.
 * The plaintext inside is the RAW pasted env text, byte-for-byte — never a
 * re-serialized key/value form.
 */
export interface EncryptedBlob {
  /** Format version (see BLOB_FORMAT_VERSION). */
  v: BlobFormatVersion;
  /** Symmetric algorithm. Always "AES-GCM" at v1. */
  alg: "AES-GCM";
  /** 12-byte nonce/IV, base64. Unique per encryption. */
  nonce: string;
  /** Ciphertext (incl. GCM auth tag), base64. */
  ciphertext: string;
}

/** KDF parameters stored per-account, so the cost can change over time. */
export type KdfParams =
  | {
      id: Extract<KdfId, "argon2id">;
      memoryKiB: number;
      iterations: number;
      parallelism: number;
      hashLengthBytes: number;
      /** Per-account random salt, base64. Not secret. */
      salt: string;
    }
  | {
      id: Extract<KdfId, "pbkdf2-sha256">;
      hash: "SHA-256";
      iterations: number;
      hashLengthBytes: number;
      salt: string;
    };

/**
 * A DEK wrapped (encrypted) under some key-encryption key. Same shape as an
 * EncryptedBlob but semantically distinct: the plaintext is the 32-byte DEK.
 */
export interface WrappedKey {
  v: BlobFormatVersion;
  alg: "AES-GCM";
  nonce: string;
  ciphertext: string;
}

/**
 * Everything the server stores to let a browser unlock the vault. All fields
 * are opaque to the server; none can decrypt anything without the passphrase
 * or the recovery key.
 */
export interface VaultKeyMaterial {
  kdfParams: KdfParams;
  /** DEK wrapped under the passphrase-derived KEK. */
  wrappedDek: WrappedKey;
  /** DEK wrapped under the recovery-key-derived key. */
  wrappedDekRecovery: WrappedKey;
}
