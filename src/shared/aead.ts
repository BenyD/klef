// SPDX-License-Identifier: MIT
//
// AES-256-GCM with additional data, for the small key objects teams add: a
// user's private key under their DEK, a project key under a team key, one
// generation under the next. The additional data names what the ciphertext is
// for (its purpose, its owner, its generation), so a wrap the server moves to
// another row fails to open instead of opening as something else.
//
// Env blobs do not go through here. They stay exactly as crypto.ts writes
// them, with no additional data, so the blob contract is unchanged.

import { AES, BLOB_FORMAT_VERSION } from "./constants.ts";
import { base64ToBytes, bytesToBase64, utf8ToBytes, type Bytes } from "./encoding.ts";
import type { WrappedKey } from "./types.ts";

/** The additional data for a purpose and its context: one string per line. */
export function contextData(purpose: string, ...context: (string | number)[]): Bytes {
  for (const part of context) {
    if (String(part).includes("\n")) throw new Error("Context parts cannot contain a newline");
  }
  return utf8ToBytes([purpose, ...context].join("\n"));
}

/** Encrypt bytes under `key`, bound to `aad`. A fresh nonce every time. */
export async function sealWithContext(key: CryptoKey, plaintext: Bytes, aad: Bytes): Promise<WrappedKey> {
  const nonce = crypto.getRandomValues(new Uint8Array(AES.nonceBytes));
  const ciphertext = await crypto.subtle.encrypt(
    { name: AES.name, iv: nonce, tagLength: AES.tagBits, additionalData: aad },
    key,
    plaintext,
  );
  return {
    v: BLOB_FORMAT_VERSION,
    alg: "AES-GCM",
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

/** Open what sealWithContext made. Throws on a wrong key, wrong context, or tampering. */
export async function openWithContext(key: CryptoKey, sealed: WrappedKey, aad: Bytes): Promise<Bytes> {
  if (sealed.v !== BLOB_FORMAT_VERSION || sealed.alg !== "AES-GCM") {
    throw new Error(`Unsupported wrapped-key version: ${sealed.v}`);
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: AES.name, iv: base64ToBytes(sealed.nonce), tagLength: AES.tagBits, additionalData: aad },
    key,
    base64ToBytes(sealed.ciphertext),
  );
  return new Uint8Array(plaintext);
}
