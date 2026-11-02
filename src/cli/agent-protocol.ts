// SPDX-License-Identifier: MIT
//
// The wire format between the CLI and its unlock agent. Pure, so the parsing
// that guards the agent's socket is tested without opening one.
//
// One request per connection: a single line of JSON each way, then the
// connection closes. The operations are the whole interface, and none of them
// returns key material. The DEK is non-extractable inside the agent, so there
// is no code path that could, but the protocol is also written so that no
// response type has a field to carry one.

import type { EncryptedBlob, WrappedKey } from "../shared/types.ts";
import { bytesToBase64 } from "../shared/encoding.ts";
import { isUserKeyRecord, type UserKeyRecord } from "../shared/user-key.ts";
import type { TeamDecryptRequest, TeamEncryptRequest, TeamKeyRequest } from "./team-cipher.ts";

// Team operations carry what the server served (the sharing key record, a
// team's keys response) and get back plaintext or a blob. The agent opens the
// team's keys with the DEK it holds; neither the private key nor any team key
// crosses the socket. newUserKey returns a record whose private half is sealed
// under the DEK, which is what the server stores.
export type AgentRequest =
  | { op: "status" }
  | { op: "encrypt"; plaintext: string }
  | { op: "decrypt"; blob: EncryptedBlob }
  | ({ op: "teamDecrypt" } & TeamDecryptRequest)
  | ({ op: "teamEncrypt" } & TeamEncryptRequest)
  | { op: "newUserKey"; userId: string }
  | { op: "lock" };

export interface AgentStatus {
  /** Which vault the agent holds a key for; see vaultFingerprint. */
  fingerprint: string;
  /** Milliseconds until it locks if nothing uses it. */
  msLeft: number;
  /** The inactivity timeout it was started with. */
  idleMinutes: number;
}

export type AgentResponse =
  | { ok: true; status: AgentStatus }
  | { ok: true; blob: EncryptedBlob; keyGen?: number }
  | { ok: true; plaintext: string }
  | { ok: true; userKey: UserKeyRecord }
  | { ok: true }
  | { ok: false; error: string };

/**
 * Upper bound on one request line. Env files are kilobytes; this only exists
 * so a client that never sends a newline cannot make the agent buffer forever.
 */
export const MAX_FRAME_BYTES = 8 * 1024 * 1024;

export class ProtocolError extends Error {}

function isBlob(value: unknown): value is EncryptedBlob {
  if (typeof value !== "object" || value === null) return false;
  const blob = value as Record<string, unknown>;
  return (
    typeof blob.v === "number" &&
    blob.alg === "AES-GCM" &&
    typeof blob.nonce === "string" &&
    typeof blob.ciphertext === "string"
  );
}

/** The parts every team operation shares; the keys response is checked by opening it. */
function teamKeyRequest(req: Record<string, unknown>, op: string): TeamKeyRequest {
  const keys = req.keys as Record<string, unknown> | null;
  if (
    typeof req.userId !== "string" ||
    typeof req.workspaceId !== "string" ||
    !isUserKeyRecord(req.userKey) ||
    typeof keys !== "object" ||
    keys === null ||
    !Array.isArray(keys.envKeys) ||
    typeof keys.senders !== "object" ||
    keys.senders === null
  ) {
    throw new ProtocolError(`"${op}" needs "userId", "userKey", "workspaceId" and "keys".`);
  }
  const pins = req.pins;
  if (pins !== undefined && pins !== null && !isBlob(pins)) throw new ProtocolError(`"${op}" got malformed "pins".`);
  return {
    userId: req.userId,
    userKey: req.userKey,
    workspaceId: req.workspaceId,
    keys: req.keys as TeamKeyRequest["keys"],
    ...(pins ? { pins: pins as TeamKeyRequest["pins"] } : {}),
  };
}

/** Validate one request line. Anything unexpected is refused, not coerced. */
export function parseRequest(line: string): AgentRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new ProtocolError("Request is not valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ProtocolError("Request must be a JSON object.");
  }

  const req = parsed as Record<string, unknown>;
  switch (req.op) {
    case "status":
    case "lock":
      return { op: req.op };
    case "encrypt":
      if (typeof req.plaintext !== "string") {
        throw new ProtocolError('"encrypt" needs a string "plaintext".');
      }
      return { op: "encrypt", plaintext: req.plaintext };
    case "decrypt":
      if (!isBlob(req.blob)) throw new ProtocolError('"decrypt" needs a "blob".');
      return { op: "decrypt", blob: req.blob };
    case "teamDecrypt": {
      const base = teamKeyRequest(req, "teamDecrypt");
      if (!isBlob(req.blob) || typeof req.keyScope !== "string" || !Number.isInteger(req.keyGen)) {
        throw new ProtocolError('"teamDecrypt" needs a "blob", "keyScope" and "keyGen".');
      }
      return { op: "teamDecrypt", ...base, blob: req.blob, keyScope: req.keyScope, keyGen: req.keyGen as number };
    }
    case "teamEncrypt": {
      const base = teamKeyRequest(req, "teamEncrypt");
      if (typeof req.projectId !== "string" || typeof req.environment !== "string" || typeof req.plaintext !== "string") {
        throw new ProtocolError('"teamEncrypt" needs "projectId", "environment" and "plaintext".');
      }
      return { op: "teamEncrypt", ...base, projectId: req.projectId, environment: req.environment, plaintext: req.plaintext };
    }
    case "newUserKey":
      if (typeof req.userId !== "string") throw new ProtocolError('"newUserKey" needs a "userId".');
      return { op: "newUserKey", userId: req.userId };
    default:
      throw new ProtocolError(`Unknown operation ${JSON.stringify(req.op)}.`);
  }
}

export function encodeFrame(message: AgentRequest | AgentResponse): string {
  return `${JSON.stringify(message)}\n`;
}

/**
 * Which vault a key belongs to, without being anything secret: a hash of the
 * wrapped DEK, which the server stores and hands to any signed-in client. A
 * CLI compares it before using the agent, so an agent unlocked for one
 * account or server is never asked to decrypt another's files. It changes when
 * the passphrase does, which just means unlocking again.
 */
export async function vaultFingerprint(wrappedDek: WrappedKey): Promise<string> {
  const input = new TextEncoder().encode(`${wrappedDek.nonce}.${wrappedDek.ciphertext}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return bytesToBase64(digest.slice(0, 16));
}

/** "14 min", "under a minute": status output, rounded the way people read it. */
export function describeTimeLeft(msLeft: number): string {
  if (msLeft < 60_000) return "under a minute";
  const minutes = Math.floor(msLeft / 60_000);
  if (minutes < 120) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hours`;
  return `${Math.floor(hours / 24)} days`;
}

/** "15 minutes", "8 hours", "7 days": a chosen timeout, as people say it. */
export function describeLockAfter(minutes: number): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (minutes % (24 * 60) === 0) return plural(minutes / (24 * 60), "day");
  if (minutes % 60 === 0) return plural(minutes / 60, "hour");
  return plural(minutes, "minute");
}

/**
 * `klef unlock --for 8h`: a whole number with m, h or d, or bare minutes.
 * Null for anything else, or outside 1 minute to `max` minutes, so a typo
 * never quietly becomes "forever".
 */
export function parseLockAfter(text: string, max: number): number | null {
  const match = /^(\d+)\s*(m|min|h|d)?$/i.exec(text.trim());
  if (!match) return null;
  const unit = (match[2] ?? "m").toLowerCase();
  const minutes =
    Number(match[1]) * (unit === "d" ? 24 * 60 : unit === "h" ? 60 : 1);
  return minutes >= 1 && minutes <= max ? minutes : null;
}
