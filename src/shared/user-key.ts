// SPDX-License-Identifier: MIT
//
// Each account's sharing keypair: a P-256 ECDH key that teammates wrap team
// keys to. See docs/SHARING_DESIGN.md and BLOB_FORMAT.md ("User keys").
//
// The public half is stored in the clear, with a fingerprint people can compare.
// The private half is stored as PKCS8 encrypted under the account DEK, so
// every way of unlocking the vault (passphrase, recovery key, passkey, a
// remembered key, the unlock agent) opens it with no new prompt, and a
// passphrase change touches nothing here. It is extractable for one export at
// generation and non-extractable everywhere after.

import { contextData, openWithContext, sealWithContext } from "./aead.ts";
import { USER_KEY } from "./constants.ts";
import { CURVE, type DeviceJwk } from "./device-seal.ts";
import { bytesToCrockford, utf8ToBytes, type Bytes } from "./encoding.ts";
import type { WrappedKey } from "./types.ts";

const USER_KEY_INFO = "klef/user-key/v1";
const PINS_INFO = "klef/user-pins/v1";

/** A user's public key as the server stores and serves it. */
export interface UserPublicKey {
  publicJwk: DeviceJwk;
  /** Hex, from userKeyFingerprint(publicJwk). */
  fingerprint: string;
}

/** What the server stores for a user's keypair. Opaque without the DEK. */
export interface UserKeyRecord extends UserPublicKey {
  privateWrapped: WrappedKey;
}

/** An opened keypair, held in memory for the session. */
export interface UserKeypair extends UserPublicKey {
  /** Non-extractable; usable only for ECDH deriveBits. */
  privateKey: CryptoKey;
}

/** Only the fields that identify a public key, so stray JWK members never travel. */
export function publicOnly(jwk: DeviceJwk): DeviceJwk {
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Bytes {
  if (!/^(?:[0-9a-f]{2})+$/.test(hex)) throw new Error("Not a hex fingerprint");
  return new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));
}

/** SHA-256 over the curve and coordinates, truncated, as hex. */
export async function userKeyFingerprint(publicJwk: DeviceJwk): Promise<string> {
  const input = utf8ToBytes([USER_KEY_INFO, publicJwk.crv, publicJwk.x, publicJwk.y].join("\n"));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return toHex(digest.slice(0, USER_KEY.fingerprintBytes));
}

/** The form people compare: "ABCD EFGH JKMN PQRS" (the first 80 bits, Crockford). */
export function formatFingerprint(fingerprint: string): string {
  const body = bytesToCrockford(fromHex(fingerprint).slice(0, USER_KEY.displayBytes));
  return body.match(/.{1,4}/g)!.join(" ");
}

/** Check a served public key against its fingerprint before trusting either. */
export async function verifyUserPublicKey(key: UserPublicKey): Promise<boolean> {
  return (await userKeyFingerprint(key.publicJwk)) === key.fingerprint;
}

function privateKeyContext(userId: string, fingerprint: string): Bytes {
  return contextData(USER_KEY_INFO, userId, fingerprint);
}

/**
 * Make a keypair for `userId` and wrap its private half under their DEK.
 * Returns what to store and the keypair to use right away.
 */
export async function generateUserKey(
  dek: CryptoKey,
  userId: string,
): Promise<{ record: UserKeyRecord; keypair: UserKeypair }> {
  const pair = await crypto.subtle.generateKey(CURVE, true, ["deriveBits"]);
  const publicJwk = publicOnly((await crypto.subtle.exportKey("jwk", pair.publicKey)) as DeviceJwk);
  const fingerprint = await userKeyFingerprint(publicJwk);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const privateWrapped = await sealWithContext(dek, pkcs8, privateKeyContext(userId, fingerprint));
  const privateKey = await importPrivateKey(pkcs8);
  pkcs8.fill(0);
  return {
    record: { publicJwk, fingerprint, privateWrapped },
    keypair: { publicJwk, fingerprint, privateKey },
  };
}

function importPrivateKey(pkcs8: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", pkcs8, CURVE, false, ["deriveBits"]);
}

/**
 * Open a stored keypair with the DEK. Throws if the fingerprint does not match
 * the public key, or the wrap was made for another user or another key.
 */
export async function openUserKey(dek: CryptoKey, userId: string, record: UserKeyRecord): Promise<UserKeypair> {
  if (!(await verifyUserPublicKey(record))) throw new Error("User key fingerprint does not match its public key");
  const pkcs8 = await openWithContext(dek, record.privateWrapped, privateKeyContext(userId, record.fingerprint));
  try {
    return {
      publicJwk: publicOnly(record.publicJwk),
      fingerprint: record.fingerprint,
      privateKey: await importPrivateKey(pkcs8),
    };
  } finally {
    pkcs8.fill(0);
  }
}

/** Fingerprints this user has seen for other people, by user id. */
export type FingerprintPins = Record<string, string>;

/** Encrypt the pins under the DEK. */
export function sealPins(dek: CryptoKey, userId: string, pins: FingerprintPins): Promise<WrappedKey> {
  return sealWithContext(dek, utf8ToBytes(JSON.stringify(pins)), contextData(PINS_INFO, userId));
}

/** Open the pins. A missing blob is no pins, never an error. */
export async function openPins(dek: CryptoKey, userId: string, sealed: WrappedKey | null): Promise<FingerprintPins> {
  if (!sealed) return {};
  const bytes = await openWithContext(dek, sealed, contextData(PINS_INFO, userId));
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === "string"),
  );
}

/**
 * What a client should conclude about a key the server presents for someone:
 * new (never seen), the same as pinned, or changed, which is the case to stop
 * and show loudly.
 */
export function checkPin(pins: FingerprintPins, userId: string, fingerprint: string): "new" | "match" | "changed" {
  const pinned = pins[userId];
  if (pinned === undefined) return "new";
  return pinned === fingerprint ? "match" : "changed";
}

/** Shape check for a stored record before trusting it. */
export function isUserKeyRecord(v: unknown): v is UserKeyRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  const jwk = r.publicJwk as Record<string, unknown> | null;
  const wrapped = r.privateWrapped as Record<string, unknown> | null;
  return (
    typeof jwk === "object" && jwk !== null &&
    jwk.kty === "EC" && jwk.crv === "P-256" && typeof jwk.x === "string" && typeof jwk.y === "string" &&
    typeof r.fingerprint === "string" && /^[0-9a-f]+$/.test(r.fingerprint) &&
    typeof wrapped === "object" && wrapped !== null &&
    wrapped.alg === "AES-GCM" && typeof wrapped.nonce === "string" && typeof wrapped.ciphertext === "string"
  );
}
