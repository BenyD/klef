// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Handing the vault key to the CLI at sign-in, end to end.
//
// `klef login` already sends an ECDH public key so the minted token can be
// sealed to it (device-seal.ts). When the person approving in the browser
// also chooses to unlock the CLI, the page recovers the DEK's bytes there (by
// passkey or passphrase: the tab's own key is non-extractable and stays so),
// seals them to that same public key, and drops them. The server stores the
// sealed blob beside the sealed token and hands both over once, on the CLI's
// collecting poll. Only the CLI, which never let go of the private half, can
// open it.
//
// The ciphertext is bound, as AES-GCM additional data, to the user code shown
// on both screens, the approving user's id, and the CLI's public key. The
// device code would be the natural binding, but the browser never sees it
// (the server keeps only its hash), so a blob is instead pinned to this one
// approval of this one user for this one key. Opened against anything else,
// it fails to decrypt.

import { AES } from "./constants.ts";
import { CURVE, sharedKey, type DeviceJwk } from "./device-seal.ts";
import { normalizeUserCode } from "./device-code.ts";
import { base64ToBytes, bytesToBase64, utf8ToBytes, type Bytes } from "./encoding.ts";

/** Domain separation from the token seal, versioned so it can change safely. */
const UNLOCK_INFO = "klef/device-unlock/v1";

/** What the sealed key is pinned to. */
export interface UnlockBinding {
  userCode: string;
  userId: string;
}

/** A sealed vault key as stored and returned. Opaque without the CLI's private key. */
export interface SealedVaultKey {
  v: 1;
  ephemeralPublicJwk: DeviceJwk;
  nonce: string;
  ciphertext: string;
}

function additionalData(binding: UnlockBinding, devicePublicJwk: DeviceJwk): Bytes {
  const code = normalizeUserCode(binding.userCode) ?? binding.userCode;
  return utf8ToBytes(
    [UNLOCK_INFO, code, binding.userId, `${devicePublicJwk.x}.${devicePublicJwk.y}`].join("\n"),
  );
}

/**
 * Seal the DEK's raw bytes to the CLI's public key. A fresh ephemeral key per
 * seal, so the shared secret is unique to this handoff. The caller zeroes
 * `dekBytes` afterwards.
 */
export async function sealVaultKey(
  devicePublicJwk: DeviceJwk,
  dekBytes: Bytes,
  binding: UnlockBinding,
): Promise<SealedVaultKey> {
  const ephemeral = await crypto.subtle.generateKey(CURVE, true, ["deriveBits"]);
  const key = await sharedKey(ephemeral.privateKey, devicePublicJwk, UNLOCK_INFO);
  const nonce = crypto.getRandomValues(new Uint8Array(AES.nonceBytes)) as Bytes;
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: AES.name, iv: nonce, additionalData: additionalData(binding, devicePublicJwk) },
      key,
      dekBytes,
    ),
  );
  return {
    v: 1,
    ephemeralPublicJwk: (await crypto.subtle.exportKey("jwk", ephemeral.publicKey)) as DeviceJwk,
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(ciphertext),
  };
}

/**
 * Open a sealed vault key with the CLI's private key. Throws if the key is
 * wrong, the blob was altered, or it was sealed for another user code, user
 * or device.
 */
export async function openVaultKey(
  privateKey: CryptoKey,
  devicePublicJwk: DeviceJwk,
  sealed: SealedVaultKey,
  binding: UnlockBinding,
): Promise<Bytes> {
  if (sealed.v !== 1) throw new Error(`Unsupported sealed vault key version: ${String(sealed.v)}`);
  const key = await sharedKey(privateKey, sealed.ephemeralPublicJwk, UNLOCK_INFO);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: AES.name,
      iv: base64ToBytes(sealed.nonce),
      additionalData: additionalData(binding, devicePublicJwk),
    },
    key,
    base64ToBytes(sealed.ciphertext),
  );
  return new Uint8Array(plaintext) as Bytes;
}

/** Shape check for what comes over the wire, before trusting it or storing it. */
export function isSealedVaultKey(v: unknown): v is SealedVaultKey {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  const jwk = s.ephemeralPublicJwk as Record<string, unknown> | null;
  return (
    s.v === 1 &&
    typeof s.nonce === "string" &&
    s.nonce.length <= 64 &&
    typeof s.ciphertext === "string" &&
    s.ciphertext.length <= 256 &&
    typeof jwk === "object" &&
    jwk !== null &&
    jwk.kty === "EC" &&
    jwk.crv === "P-256" &&
    typeof jwk.x === "string" &&
    typeof jwk.y === "string"
  );
}
