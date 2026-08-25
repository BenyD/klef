import { describe, expect, it } from "vitest";
import { generateToken } from "./access-token-format.ts";
import {
  generateSealKeypair,
  isPublicJwk,
  isSealedToken,
  openToken,
  sealToken,
} from "./device-seal.ts";

// The point of sealing: between approval and collection the row exists on the
// server, and it must not be a usable credential to anyone who reads it -
// including the server. Only the machine that started the login holds the
// private half.
describe("device seal", () => {
  it("round-trips a token to the device that asked for it", async () => {
    const device = await generateSealKeypair();
    const token = generateToken();
    const sealed = await sealToken(device.publicJwk, token);
    expect(await openToken(device.privateKey, sealed)).toBe(token);
  });

  it("keeps the token out of what gets stored", async () => {
    const device = await generateSealKeypair();
    const token = generateToken();
    const sealed = await sealToken(device.publicJwk, token);
    const stored = JSON.stringify(sealed);
    expect(stored).not.toContain(token);
    expect(stored).not.toContain(token.slice(9, 30));
  });

  it("cannot be opened by a different device", async () => {
    const mine = await generateSealKeypair();
    const theirs = await generateSealKeypair();
    const sealed = await sealToken(mine.publicJwk, generateToken());
    await expect(openToken(theirs.privateKey, sealed)).rejects.toThrow();
  });

  it("refuses a tampered ciphertext", async () => {
    const device = await generateSealKeypair();
    const sealed = await sealToken(device.publicJwk, generateToken());
    const ct = sealed.ciphertext;
    const flipped = {
      ...sealed,
      ciphertext: ct.slice(0, -2) + (ct.slice(-2) === "AA" ? "AB" : "AA"),
    };
    await expect(openToken(device.privateKey, flipped)).rejects.toThrow();
  });

  it("refuses a substituted ephemeral key", async () => {
    const device = await generateSealKeypair();
    const sealed = await sealToken(device.publicJwk, generateToken());
    const other = await sealToken(device.publicJwk, generateToken());
    await expect(
      openToken(device.privateKey, {
        ...sealed,
        ephemeralPublicJwk: other.ephemeralPublicJwk,
      }),
    ).rejects.toThrow();
  });

  it("derives a fresh secret per seal", async () => {
    const device = await generateSealKeypair();
    const token = generateToken();
    const a = await sealToken(device.publicJwk, token);
    const b = await sealToken(device.publicJwk, token);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.ephemeralPublicJwk).not.toEqual(b.ephemeralPublicJwk);
    expect(await openToken(device.privateKey, b)).toBe(token);
  });
});

describe("wire shape checks", () => {
  it("accepts a real public key and rejects anything else", async () => {
    const { publicJwk } = await generateSealKeypair();
    expect(isPublicJwk(publicJwk)).toBe(true);
    for (const bad of [null, {}, "string", { kty: "RSA" }, { kty: "EC", crv: "P-384" }]) {
      expect(isPublicJwk(bad)).toBe(false);
    }
  });

  it("accepts a real sealed token and rejects anything else", async () => {
    const device = await generateSealKeypair();
    const sealed = await sealToken(device.publicJwk, generateToken());
    expect(isSealedToken(sealed)).toBe(true);
    for (const bad of [null, {}, "string", { nonce: "a", ciphertext: "b" }]) {
      expect(isSealedToken(bad)).toBe(false);
    }
  });
});
