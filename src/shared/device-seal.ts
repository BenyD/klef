// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sealing the minted access token to the device that asked for it.
//
// A device flow has to park the token somewhere between "the user approved"
// and "the CLI polls again". Every implementation stores it; Klef's whole
// claim is that what the server stores is not usable by whoever reads it, and
// a live access token sitting in plaintext for ten minutes would be the one
// place that claim quietly stopped being true.
//
// So the CLI generates a keypair when it starts a login and sends the public
// half. The server seals the token to that key and keeps the sealed blob. The
// private half never leaves the machine that will use the token, so the stored
// row is inert to anyone with database access - including the server itself.
//
// Sealing under the device code instead would not work: the server only ever
// holds its hash. Sealing under the user code would be worse than useless, as
// it is eight readable characters displayed in a browser.

import { AES } from "./constants.ts";
import {
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  utf8ToBytes,
  type Bytes,
} from "./encoding.ts";

const CURVE = { name: "ECDH", namedCurve: "P-256" } as const;

/**
 * The JWK fields this module exchanges, declared locally rather than using the
 * global JsonWebKey: the web build types it from the DOM and the CLI build
 * from @types/node, and only one of those exists in each config.
 */
export interface DeviceJwk {
  kty: string;
  crv: string;
  x: string;
  y: string;
  ext?: boolean;
  key_ops?: string[];
}

/** Domain separation for the derived key, versioned so it can change safely. */
const SEAL_INFO = "klef/device-seal/v1";

/** What the CLI keeps locally while it polls. */
export interface SealKeypair {
  /** Sent to the server with the login request. */
  publicJwk: DeviceJwk;
  /** Never leaves this process. */
  privateKey: CryptoKey;
}

/** A sealed token as stored and returned. Opaque without the private key. */
export interface SealedToken {
  ephemeralPublicJwk: DeviceJwk;
  nonce: string;
  ciphertext: string;
}

export async function generateSealKeypair(): Promise<SealKeypair> {
  const pair = await crypto.subtle.generateKey(CURVE, true, ["deriveBits"]);
  return {
    publicJwk: (await crypto.subtle.exportKey("jwk", pair.publicKey)) as DeviceJwk,
    privateKey: pair.privateKey,
  };
}

async function sharedKey(
  privateKey: CryptoKey,
  publicJwk: DeviceJwk,
): Promise<CryptoKey> {
  const peer = await crypto.subtle.importKey("jwk", publicJwk, CURVE, false, []);
  // deriveBits then import, rather than deriving an HKDF key straight from
  // ECDH: the latter needs a cast to typecheck and is not the shape WebCrypto
  // documents, even where runtimes happen to allow it.
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: peer }, privateKey, 256);
  const shared = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: utf8ToBytes(SEAL_INFO),
    },
    shared,
    { name: AES.name, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Seal a token to the CLI's public key. Uses a fresh ephemeral keypair per
 * seal, so the shared secret is unique to this one token even if the same
 * device key is used again.
 */
export async function sealToken(
  publicJwk: DeviceJwk,
  token: string,
): Promise<SealedToken> {
  const ephemeral = await crypto.subtle.generateKey(CURVE, true, ["deriveBits"]);
  const key = await sharedKey(ephemeral.privateKey, publicJwk);
  const nonce = crypto.getRandomValues(new Uint8Array(AES.nonceBytes)) as Bytes;
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: AES.name, iv: nonce }, key, utf8ToBytes(token)),
  );
  return {
    ephemeralPublicJwk: (await crypto.subtle.exportKey(
      "jwk",
      ephemeral.publicKey,
    )) as DeviceJwk,
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(ciphertext),
  };
}

/** Open a sealed token. Throws if the key is wrong or it was tampered with. */
export async function openToken(
  privateKey: CryptoKey,
  sealed: SealedToken,
): Promise<string> {
  const key = await sharedKey(privateKey, sealed.ephemeralPublicJwk);
  const plaintext = await crypto.subtle.decrypt(
    { name: AES.name, iv: base64ToBytes(sealed.nonce) },
    key,
    base64ToBytes(sealed.ciphertext),
  );
  return bytesToUtf8(new Uint8Array(plaintext));
}

/** Shape check for what comes back over the wire before trusting it. */
export function isSealedToken(v: unknown): v is SealedToken {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.nonce === "string" &&
    typeof s.ciphertext === "string" &&
    typeof s.ephemeralPublicJwk === "object" &&
    s.ephemeralPublicJwk !== null
  );
}

/** Shape check for the public key a client sends when starting a login. */
export function isPublicJwk(v: unknown): v is DeviceJwk {
  if (typeof v !== "object" || v === null) return false;
  const k = v as DeviceJwk;
  return k.kty === "EC" && k.crv === "P-256" && typeof k.x === "string" && typeof k.y === "string";
}
