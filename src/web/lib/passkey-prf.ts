// SPDX-License-Identifier: AGPL-3.0-or-later
//
// WebAuthn PRF: obtain a per-credential secret from an authenticator. The
// ceremony runs entirely client-side; the assertion is never sent to the
// server (the session already proves identity), only the PRF output is used,
// as key material for wrapping the DEK. See crypto.ts (klef/passkey-kek/v1).

import {
  base64UrlToBytes,
  type Bytes,
  bytesToBase64Url,
} from "../../shared/encoding.ts";

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
  if (!first) {
    throw new PasskeyPrfError(
      "no-secret",
      "This passkey cannot unlock (its authenticator has no PRF support)",
    );
  }

  return {
    credentialId: bytesToBase64Url(new Uint8Array(assertion.rawId)),
    secret: new Uint8Array(
      first instanceof ArrayBuffer ? first : first.buffer.slice(0),
    ) as Bytes,
  };
}
