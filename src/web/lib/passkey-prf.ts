// SPDX-License-Identifier: AGPL-3.0-or-later
//
// WebAuthn PRF: obtain a per-credential secret from an authenticator. The
// ceremony runs entirely client-side; the assertion is never sent to the
// server (the session already proves identity), only the PRF output is used,
// as key material for wrapping the DEK. See crypto.ts (klef/passkey-kek/v1).

import { base64UrlToBytes, type Bytes } from "../../shared/encoding.ts";

export type PasskeyPrfErrorCode = "cancelled" | "unsupported" | "no-secret";

export class PasskeyPrfError extends Error {
  readonly code: PasskeyPrfErrorCode;
  constructor(code: PasskeyPrfErrorCode, message: string) {
    super(message);
    this.name = "PasskeyPrfError";
    this.code = code;
  }
}

export interface PrfRequest {
  /** Credential id, base64url (as Better Auth stores it). */
  credentialId: string;
  /** PRF eval input for this credential. */
  salt: Bytes;
}

export interface PrfResult {
  /** The credential the user picked, base64url. */
  credentialId: string;
  /** 32-byte PRF output. Use transiently and discard. */
  secret: Bytes;
}

/**
 * Run a WebAuthn get() with the PRF extension over the given credentials and
 * return the picked credential's secret. Throws PasskeyPrfError with a code
 * the UI can message on: "cancelled" (user dismissed the prompt),
 * "unsupported" (no WebAuthn), "no-secret" (authenticator has no PRF for
 * this credential).
 */
export async function getPrfSecret(requests: PrfRequest[]): Promise<PrfResult> {
  if (typeof navigator === "undefined" || !navigator.credentials?.get) {
    throw new PasskeyPrfError(
      "unsupported",
      "This browser does not support passkeys",
    );
  }

  const evalByCredential: Record<string, { first: BufferSource }> = {};
  for (const r of requests) {
    evalByCredential[r.credentialId] = { first: r.salt };
  }

  let assertion: Credential | null;
  try {
    assertion = await navigator.credentials.get({
      publicKey: {
        // Local-only ceremony; the challenge is never verified server-side.
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: requests.map((r) => ({
          type: "public-key" as const,
          id: base64UrlToBytes(r.credentialId),
        })),
        userVerification: "required",
        extensions: { prf: { evalByCredential } },
      },
    });
  } catch (e) {
    if (
      e instanceof DOMException &&
      (e.name === "NotAllowedError" || e.name === "AbortError")
    ) {
      throw new PasskeyPrfError("cancelled", "Passkey prompt was cancelled");
    }
    throw e;
  }

  if (!(assertion instanceof PublicKeyCredential)) {
    throw new PasskeyPrfError("no-secret", "Passkey prompt returned nothing");
  }

  const first = assertion.getClientExtensionResults().prf?.results?.first;
  const secret = prfOutputToBytes(first);
  if (!secret || secret.length === 0) {
    throw new PasskeyPrfError(
      "no-secret",
      "This passkey cannot unlock (its authenticator has no PRF support)",
    );
  }

  // PublicKeyCredential.id is already the base64url of rawId, in exactly the
  // form Better Auth stores; interceptors that rewrap rawId still set id.
  return { credentialId: assertion.id, secret };
}

/**
 * Normalize a PRF output to bytes. The spec says ArrayBuffer, but WebAuthn
 * interceptors (password-manager extensions like 1Password) hand back typed
 * arrays or base64url strings instead. Null when the shape is unreadable.
 */
export function prfOutputToBytes(value: unknown): Bytes | null {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    ) as Bytes;
  }
  if (typeof value === "string" && value.length > 0) {
    try {
      return base64UrlToBytes(value);
    } catch {
      return null;
    }
  }
  return null;
}
