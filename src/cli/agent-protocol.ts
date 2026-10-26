// SPDX-License-Identifier: AGPL-3.0-or-later
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

export type AgentRequest =
  | { op: "status" }
  | { op: "encrypt"; plaintext: string }
  | { op: "decrypt"; blob: EncryptedBlob }
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
  | { ok: true; blob: EncryptedBlob }
  | { ok: true; plaintext: string }
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
  return `${minutes} min`;
}
