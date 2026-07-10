import { describe, expect, it } from "vitest";
import { prfOutputToBytes } from "./passkey-prf.ts";
import { bytesToBase64Url } from "../../shared/encoding.ts";

// The WebAuthn spec says PRF outputs are ArrayBuffers, but interceptors
// (password-manager extensions) return typed arrays or base64url strings.
// Whatever the shape, the same 32 bytes must come out.
describe("prfOutputToBytes", () => {
  const secret = crypto.getRandomValues(new Uint8Array(32));

  it("reads an ArrayBuffer (the spec shape)", () => {
    expect(prfOutputToBytes(secret.buffer.slice(0))).toEqual(secret);
  });

  it("reads a typed array, respecting view offsets", () => {
    const padded = new Uint8Array(40);
    padded.set(secret, 4);
    const view = new Uint8Array(padded.buffer, 4, 32);
    expect(prfOutputToBytes(view)).toEqual(secret);
  });

  it("reads a DataView", () => {
    expect(prfOutputToBytes(new DataView(secret.buffer.slice(0)))).toEqual(
      secret,
    );
  });

  it("reads a base64url string (1Password-style interceptor output)", () => {
    expect(prfOutputToBytes(bytesToBase64Url(secret))).toEqual(secret);
  });

  it("returns null for unreadable shapes", () => {
    expect(prfOutputToBytes(undefined)).toBeNull();
    expect(prfOutputToBytes(null)).toBeNull();
    expect(prfOutputToBytes("")).toBeNull();
    expect(prfOutputToBytes("!!!not-base64!!!")).toBeNull();
    expect(prfOutputToBytes({ data: [1, 2, 3] })).toBeNull();
    expect(prfOutputToBytes(42)).toBeNull();
  });
});
