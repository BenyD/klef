// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Klef crypto core. Pure, headless, dependency-light (hash-wasm for Argon2id;
// otherwise native WebCrypto). This is the linchpin — everything trusts it.
// Spec: ./BLOB_FORMAT.md. Parameters: ./constants.ts. Wire types: ./types.ts.
//
// Envelope model: env blobs are encrypted with a random per-account DEK; the
// DEK is wrapped by a KEK derived from the passphrase, and also by a key derived
// from the recovery key. Wrapping = AES-GCM-encrypting the raw DEK bytes (not
// SubtleCrypto.wrapKey), which lets both KEK and DEK stay non-extractable.

import { argon2id } from "hash-wasm";
import { AES, BLOB_FORMAT_VERSION, KDF, RECOVERY_KEY } from "./constants.ts";
import {
  base64ToBytes,
  type Bytes,
  bytesToBase64,
  bytesToCrockford,
  bytesToUtf8,
  crockfordToBytes,
  utf8ToBytes,
} from "./encoding.ts";
import type {
  EncryptedBlob,
  KdfParams,
  VaultKeyMaterial,
  WrappedKey,
} from "./types.ts";

// HKDF context string for deriving the recovery wrapping key. Versioned so it
// can change without colliding with past derivations.
const RECOVERY_HKDF_INFO = "klef/recovery-kek/v1";

// --- low-level primitives --------------------------------------------------

export function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** Derive raw KEK bytes from a passphrase using the account's KDF parameters. */
export async function deriveKekBytes(
  passphrase: string,
  params: KdfParams,
): Promise<Bytes> {
  const salt = base64ToBytes(params.salt);

  if (params.id === "argon2id") {
    // Copy into a fresh ArrayBuffer-backed view for WebCrypto compatibility.
    return new Uint8Array(
      await argon2id({
        password: passphrase,
        salt,
        parallelism: params.parallelism,
        iterations: params.iterations,
        memorySize: params.memoryKiB,
        hashLength: params.hashLengthBytes,
        outputType: "binary",
      }),
    );
  }

  // PBKDF2 fallback (native WebCrypto).
  const baseKey = await crypto.subtle.importKey(
    "raw",
    utf8ToBytes(passphrase),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: params.hash, salt, iterations: params.iterations },
    baseKey,
    params.hashLengthBytes * 8,
  );
  return new Uint8Array(bits);
}

/** Import raw bytes as a non-extractable AES-GCM key. */
export function importAesKey(bytes: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bytes, { name: AES.name }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Fresh KDF parameters (Argon2id + new random salt) for a new vault. */
export function newKdfParams(): KdfParams {
  return {
    id: "argon2id",
    memoryKiB: KDF.argon2id.memoryKiB,
    iterations: KDF.argon2id.iterations,
    parallelism: KDF.argon2id.parallelism,
    hashLengthBytes: KDF.argon2id.hashLengthBytes,
    salt: bytesToBase64(randomBytes(KDF.argon2id.saltBytes)),
  };
}

/** Derive the KEK as a usable AES-GCM CryptoKey. */
export async function deriveKek(
  passphrase: string,
  params: KdfParams,
): Promise<CryptoKey> {
  return importAesKey(await deriveKekBytes(passphrase, params));
}

// --- AES-GCM ---------------------------------------------------------------

async function aesGcmEncrypt(
  key: CryptoKey,
  plaintext: Bytes,
): Promise<{ nonce: Bytes; ciphertext: Bytes }> {
  const nonce = randomBytes(AES.nonceBytes);
  const ct = await crypto.subtle.encrypt(
    { name: AES.name, iv: nonce, tagLength: AES.tagBits },
    key,
    plaintext,
  );
  return { nonce, ciphertext: new Uint8Array(ct) };
}

async function aesGcmDecrypt(
  key: CryptoKey,
  nonce: Bytes,
  ciphertext: Bytes,
): Promise<Bytes> {
  const pt = await crypto.subtle.decrypt(
    { name: AES.name, iv: nonce, tagLength: AES.tagBits },
    key,
    ciphertext,
  );
  return new Uint8Array(pt);
}

// --- blobs (env contents) --------------------------------------------------

/** Encrypt the raw pasted env text under the DEK. */
export async function encryptBlob(
  dek: CryptoKey,
  plaintext: string,
): Promise<EncryptedBlob> {
  const { nonce, ciphertext } = await aesGcmEncrypt(dek, utf8ToBytes(plaintext));
  return {
    v: BLOB_FORMAT_VERSION,
    alg: "AES-GCM",
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(ciphertext),
  };
}

/** Decrypt a stored blob back to the exact original text. */
export async function decryptBlob(
  dek: CryptoKey,
  blob: EncryptedBlob,
): Promise<string> {
  if (blob.v !== BLOB_FORMAT_VERSION) {
    throw new Error(`Unsupported blob version: ${blob.v}`);
  }
  const pt = await aesGcmDecrypt(
    dek,
    base64ToBytes(blob.nonce),
    base64ToBytes(blob.ciphertext),
  );
  return bytesToUtf8(pt);
}

// --- key wrapping (envelope) ----------------------------------------------

/** Wrap raw key bytes (the DEK) by AES-GCM-encrypting them under a wrapping key. */
async function wrapKeyBytes(
  wrappingKey: CryptoKey,
  keyBytes: Bytes,
): Promise<WrappedKey> {
  const { nonce, ciphertext } = await aesGcmEncrypt(wrappingKey, keyBytes);
  return {
    v: BLOB_FORMAT_VERSION,
    alg: "AES-GCM",
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(ciphertext),
  };
}

/** Unwrap to raw key bytes. Caller should use them transiently and discard. */
async function unwrapKeyBytes(
  wrappingKey: CryptoKey,
  wrapped: WrappedKey,
): Promise<Bytes> {
  if (wrapped.v !== BLOB_FORMAT_VERSION) {
    throw new Error(`Unsupported wrapped-key version: ${wrapped.v}`);
  }
  return aesGcmDecrypt(
    wrappingKey,
    base64ToBytes(wrapped.nonce),
    base64ToBytes(wrapped.ciphertext),
  );
}

// --- recovery key ----------------------------------------------------------

/** Generate a 128-bit recovery key and its human-facing display form. */
export function generateRecoveryKey(): { bytes: Bytes; display: string } {
  const bytes = randomBytes(RECOVERY_KEY.entropyBytes);
  return { bytes, display: formatRecoveryKey(bytes) };
}

/** Bytes → "KLEF-XXXXX-XXXXX-…" display form. */
export function formatRecoveryKey(bytes: Uint8Array): string {
  const body = bytesToCrockford(bytes);
  const groups = body.match(new RegExp(`.{1,${RECOVERY_KEY.groupSize}}`, "g")) ?? [];
  return [RECOVERY_KEY.prefix, ...groups].join("-");
}

/** Parse a user-entered recovery key back to its 16 bytes (tolerant of case/spacing). */
export function parseRecoveryKey(display: string): Bytes {
  const withoutPrefix = display
    .trim()
    .replace(new RegExp(`^${RECOVERY_KEY.prefix}[-\\s]*`, "i"), "");
  return crockfordToBytes(withoutPrefix, RECOVERY_KEY.entropyBytes);
}

/** Derive the recovery wrapping key (HKDF-SHA-256) from recovery-key bytes. */
async function deriveRecoveryWrappingKey(
  recoveryBytes: Bytes,
): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey("raw", recoveryBytes, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: utf8ToBytes(RECOVERY_HKDF_INFO),
    },
    ikm,
    { name: AES.name, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// --- high-level vault operations ------------------------------------------

export interface VaultSetupResult {
  /** Everything the server stores. */
  keyMaterial: VaultKeyMaterial;
  /** Show this to the user exactly once. */
  recoveryKey: string;
  /** The live DEK for this session (non-extractable). */
  dek: CryptoKey;
}

/**
 * First-run setup: generate a DEK, wrap it under both the passphrase-derived KEK
 * and the recovery key, and return the material to persist plus the live DEK.
 */
export async function setupVault(passphrase: string): Promise<VaultSetupResult> {
  const dekBytes = randomBytes(AES.keyBytes);

  const kdfParams = newKdfParams();
  const kek = await deriveKek(passphrase, kdfParams);
  const wrappedDek = await wrapKeyBytes(kek, dekBytes);

  const recovery = generateRecoveryKey();
  const recoveryKey = await deriveRecoveryWrappingKey(recovery.bytes);
  const wrappedDekRecovery = await wrapKeyBytes(recoveryKey, dekBytes);

  const dek = await importAesKey(dekBytes);

  return {
    keyMaterial: { kdfParams, wrappedDek, wrappedDekRecovery },
    recoveryKey: recovery.display,
    dek,
  };
}

/** Unlock with the passphrase: derive KEK, unwrap DEK, return the live DEK. */
export async function unlockWithPassphrase(
  passphrase: string,
  kdfParams: KdfParams,
  wrappedDek: WrappedKey,
): Promise<CryptoKey> {
  const kek = await deriveKek(passphrase, kdfParams);
  const dekBytes = await unwrapKeyBytes(kek, wrappedDek);
  return importAesKey(dekBytes);
}

/** Unlock with the recovery key (e.g. forgotten passphrase). */
export async function unlockWithRecoveryKey(
  recoveryKeyDisplay: string,
  wrappedDekRecovery: WrappedKey,
): Promise<CryptoKey> {
  const recoveryBytes = parseRecoveryKey(recoveryKeyDisplay);
  const recoveryKey = await deriveRecoveryWrappingKey(recoveryBytes);
  const dekBytes = await unwrapKeyBytes(recoveryKey, wrappedDekRecovery);
  return importAesKey(dekBytes);
}

/**
 * Change the passphrase by re-wrapping the DEK only (no blobs are touched).
 * Uses the OLD passphrase to recover the DEK bytes, then re-wraps under a fresh
 * KEK with new KDF params. The recovery-wrapped DEK is unchanged.
 */
export async function changePassphrase(
  oldPassphrase: string,
  newPassphrase: string,
  kdfParams: KdfParams,
  wrappedDek: WrappedKey,
): Promise<{ kdfParams: KdfParams; wrappedDek: WrappedKey }> {
  const oldKek = await deriveKek(oldPassphrase, kdfParams);
  const dekBytes = await unwrapKeyBytes(oldKek, wrappedDek);

  const nextParams = newKdfParams();
  const newKek = await deriveKek(newPassphrase, nextParams);
  const nextWrapped = await wrapKeyBytes(newKek, dekBytes);

  return { kdfParams: nextParams, wrappedDek: nextWrapped };
}
