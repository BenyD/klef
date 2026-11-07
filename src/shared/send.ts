// SPDX-License-Identifier: MIT
//
// One-time sends: one secret, once, to anyone, through a link. See
// docs/SHARING_DESIGN.md and BLOB_FORMAT.md ("Sends").
//
// The key is 32 random bytes that travel only in the URL fragment, which a
// browser never sends to a server, not even in Referer. The server stores the
// ciphertext under a client-chosen id and hands it out once. An optional
// passphrase, told to the recipient another way, is mixed into the key
// through Argon2id, so an intercepted link alone is not enough.
//
// The plaintext is length-prefixed and zero-padded to a fixed bucket, so the
// stored size says "under 1 KiB", not "a 40-character token". A send is a
// value or a short note, never an env blob; the blob contract does not apply.

import { contextData, openWithContext, sealWithContext } from "./aead.ts";
import { SEND } from "./constants.ts";
import { deriveKekBytes, newKdfParams } from "./crypto.ts";
import { base64UrlToBytes, bytesToBase64Url, bytesToUtf8, utf8ToBytes, type Bytes } from "./encoding.ts";
import type { KdfParams, WrappedKey } from "./types.ts";

const SEND_INFO = "klef/send/v1";
const SEND_PASSPHRASE_INFO = "klef/send/v1/passphrase";

/** The largest text a send can carry, in UTF-8 bytes. */
export const MAX_SEND_BYTES = SEND.paddingBuckets[SEND.paddingBuckets.length - 1]! - SEND.lengthPrefixBytes;

/** How long a send can wait to be opened, in seconds, shortest first. */
export const SEND_EXPIRY_OPTIONS = [
  { seconds: 900, label: "15 minutes" },
  { seconds: 3600, label: "1 hour" },
  { seconds: 86_400, label: "1 day" },
  { seconds: 3 * 86_400, label: "3 days" },
  { seconds: 7 * 86_400, label: "7 days" },
  { seconds: 30 * 86_400, label: "30 days" },
] as const;

/** The default expiry: one day. */
export const DEFAULT_SEND_EXPIRY = 86_400;

/** Whether a sender may pick this expiry. */
export function isSendExpiry(seconds: unknown): seconds is number {
  return SEND_EXPIRY_OPTIONS.some((o) => o.seconds === seconds);
}

/** What the server stores. Opaque without the fragment key. */
export interface StoredSend {
  id: string;
  blob: WrappedKey;
  /** Present when the sender added a passphrase. Not secret, like any KDF salt. */
  kdfParams?: KdfParams;
}

/** A new send: what to upload, and the key for the link. */
export interface NewSend {
  stored: StoredSend;
  /** base64url; goes after the `#`. Never sent to the server. */
  fragmentKey: string;
}

/** Length prefix, then the text, then zeros up to the first bucket that fits. */
export function padSendText(text: string): Bytes {
  const body = utf8ToBytes(text);
  if (body.length > MAX_SEND_BYTES) throw new Error(`A send can hold at most ${MAX_SEND_BYTES} bytes`);
  const needed = body.length + SEND.lengthPrefixBytes;
  const size = SEND.paddingBuckets.find((b) => b >= needed)!;
  const padded = new Uint8Array(size);
  new DataView(padded.buffer).setUint32(0, body.length, false);
  padded.set(body, SEND.lengthPrefixBytes);
  return padded;
}

/** Undo padSendText. Throws on a length that does not fit. */
export function unpadSendText(padded: Uint8Array): string {
  if (padded.length < SEND.lengthPrefixBytes) throw new Error("Send is too short");
  const length = new DataView(padded.buffer, padded.byteOffset, padded.byteLength).getUint32(0, false);
  if (length > padded.length - SEND.lengthPrefixBytes) throw new Error("Send length does not fit");
  return bytesToUtf8(padded.subarray(SEND.lengthPrefixBytes, SEND.lengthPrefixBytes + length));
}

async function sendKey(fragmentKey: Bytes, passphraseKey: Bytes | null): Promise<CryptoKey> {
  const ikm = passphraseKey ? concat(fragmentKey, passphraseKey) : fragmentKey;
  const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveKey"]);
  if (passphraseKey) ikm.fill(0);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: utf8ToBytes(passphraseKey ? SEND_PASSPHRASE_INFO : SEND_INFO),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function concat(a: Bytes, b: Bytes): Bytes {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

/** Encrypt `text` for a link. Pass a passphrase to require it on opening. */
export async function createSend(text: string, options: { passphrase?: string } = {}): Promise<NewSend> {
  const id = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(SEND.idBytes)));
  const fragment = crypto.getRandomValues(new Uint8Array(SEND.keyBytes));
  const kdfParams = options.passphrase ? newKdfParams() : undefined;
  const passphraseKey = options.passphrase ? await deriveKekBytes(options.passphrase, kdfParams!) : null;

  const key = await sendKey(fragment, passphraseKey);
  passphraseKey?.fill(0);
  const padded = padSendText(text);
  const blob = await sealWithContext(key, padded, contextData(SEND_INFO, id));
  padded.fill(0);

  const fragmentKey = bytesToBase64Url(fragment);
  fragment.fill(0);
  return { stored: { id, blob, ...(kdfParams ? { kdfParams } : {}) }, fragmentKey };
}

/**
 * Decrypt a send with the key from the link (and the passphrase, when the
 * send has one). Throws on a wrong key, wrong passphrase, or a blob moved to
 * another id.
 */
export async function openSend(stored: StoredSend, fragmentKey: string, passphrase?: string): Promise<string> {
  const fragment = base64UrlToBytes(fragmentKey);
  if (fragment.length !== SEND.keyBytes) throw new Error("That link is incomplete");
  if (stored.kdfParams && !passphrase) throw new Error("This send needs a passphrase");
  const passphraseKey = stored.kdfParams ? await deriveKekBytes(passphrase!, stored.kdfParams) : null;

  const key = await sendKey(fragment, passphraseKey);
  passphraseKey?.fill(0);
  fragment.fill(0);
  const padded = await openWithContext(key, stored.blob, contextData(SEND_INFO, stored.id));
  try {
    return unpadSendText(padded);
  } finally {
    padded.fill(0);
  }
}

// A whole file, or some of its lines, sent with its name: the name rides
// inside the encrypted text, on a first line of its own, so the link (which
// may sit in a chat log) never says which file it is.
const FILE_PREFIX = "klef-file:";
const FILE_NAME = /^[A-Za-z0-9._-]{1,100}$/;

/** Whether a name can label a sent file: a plain file name, no path. */
export function isSendFileName(name: string): boolean {
  return FILE_NAME.test(name) && name !== "." && name !== "..";
}

/** The text to send for a file called `name`. */
export function sendFileText(name: string, content: string): string {
  if (!isSendFileName(name)) throw new Error("That file name cannot be sent");
  return `${FILE_PREFIX}${name}\n${content}`;
}

/** A sent file's name and contents, or null for a plain value. */
export function readSendFile(text: string): { name: string; content: string } | null {
  if (!text.startsWith(FILE_PREFIX)) return null;
  const end = text.indexOf("\n");
  if (end === -1) return null;
  const name = text.slice(FILE_PREFIX.length, end);
  return isSendFileName(name) ? { name, content: text.slice(end + 1) } : null;
}

/** The link: `<origin>/s/<id>#<key>`. */
export function sendUrl(origin: string, id: string, fragmentKey: string): string {
  return `${origin.replace(/\/+$/, "")}/s/${id}#${fragmentKey}`;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Whether a link's fragment has the shape of a send's key: checked before the one view is spent on it. */
export function isSendKey(fragment: string): boolean {
  return KEY_PATTERN.test(fragment);
}

/** True for an id a client could have made; the API's input check. */
export function isSendId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

/** Read the id and key back out of a link, or null when it is not one. */
export function parseSendUrl(url: string): { id: string; fragmentKey: string } | null {
  const match = /\/s\/([A-Za-z0-9_-]+)#([A-Za-z0-9_-]+)$/.exec(url.trim());
  if (!match || !ID_PATTERN.test(match[1]!) || !KEY_PATTERN.test(match[2]!)) return null;
  return { id: match[1]!, fragmentKey: match[2]! };
}
