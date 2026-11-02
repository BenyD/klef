import { describe, expect, it } from "vitest";
import { contextData, openWithContext, sealWithContext } from "./aead.ts";
import { importAesKey, randomBytes } from "./crypto.ts";
import {
  checkPin,
  formatFingerprint,
  generateUserKey,
  isUserKeyRecord,
  openPins,
  openUserKey,
  sealPins,
  userKeyFingerprint,
  verifyUserPublicKey,
} from "./user-key.ts";

const newDek = () => importAesKey(randomBytes(32));

describe("sealWithContext / openWithContext", () => {
  it("round-trips and refuses another context", async () => {
    const key = await newDek();
    const bytes = randomBytes(32);
    const sealed = await sealWithContext(key, bytes, contextData("klef/test/v1", "a", 1));
    expect(await openWithContext(key, sealed, contextData("klef/test/v1", "a", 1))).toEqual(bytes);
    await expect(openWithContext(key, sealed, contextData("klef/test/v1", "a", 2))).rejects.toThrow();
    await expect(openWithContext(key, sealed, contextData("klef/test/v1", "b", 1))).rejects.toThrow();
  });

  it("refuses a context part with a newline, which could fake another context", () => {
    expect(() => contextData("klef/test/v1", "a\nb")).toThrow();
  });
});

describe("user keys", () => {
  it("generates a keypair that opens again with the same DEK", async () => {
    const dek = await newDek();
    const { record, keypair } = await generateUserKey(dek, "user-1");
    expect(isUserKeyRecord(record)).toBe(true);
    expect(keypair.privateKey.extractable).toBe(false);

    const opened = await openUserKey(dek, "user-1", record);
    expect(opened.fingerprint).toBe(record.fingerprint);
    expect(opened.privateKey.extractable).toBe(false);

    // The two private keys are the same key: both agree with a third party.
    const other = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const derive = (priv: CryptoKey) =>
      crypto.subtle.deriveBits({ name: "ECDH", public: other.publicKey }, priv, 256);
    expect(new Uint8Array(await derive(opened.privateKey))).toEqual(new Uint8Array(await derive(keypair.privateKey)));
  });

  it("stores only the public coordinates in the clear", async () => {
    const { record } = await generateUserKey(await newDek(), "user-1");
    expect(Object.keys(record.publicJwk).sort()).toEqual(["crv", "kty", "x", "y"]);
    expect(JSON.stringify(record)).not.toContain('"d"');
  });

  it("cannot be opened with another DEK, for another user, or under a swapped public key", async () => {
    const dek = await newDek();
    const { record } = await generateUserKey(dek, "user-1");
    await expect(openUserKey(await newDek(), "user-1", record)).rejects.toThrow();
    await expect(openUserKey(dek, "user-2", record)).rejects.toThrow();

    const { record: someoneElse } = await generateUserKey(dek, "user-1");
    // The server pairs this private key with someone else's public key.
    await expect(
      openUserKey(dek, "user-1", { ...record, publicJwk: someoneElse.publicJwk, fingerprint: someoneElse.fingerprint }),
    ).rejects.toThrow();
    // Or keeps the fingerprint and swaps only the key.
    await expect(openUserKey(dek, "user-1", { ...record, publicJwk: someoneElse.publicJwk })).rejects.toThrow(
      /fingerprint/,
    );
  });

  it("fingerprints deterministically and formats them for people", async () => {
    const { record } = await generateUserKey(await newDek(), "user-1");
    expect(await userKeyFingerprint(record.publicJwk)).toBe(record.fingerprint);
    expect(record.fingerprint).toMatch(/^[0-9a-f]{32}$/);
    expect(formatFingerprint(record.fingerprint)).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}( [0-9A-HJKMNP-TV-Z]{4}){3}$/);
    expect(await verifyUserPublicKey(record)).toBe(true);
    expect(await verifyUserPublicKey({ ...record, fingerprint: "00".repeat(16) })).toBe(false);
  });

  it("matches a fixed vector, so another implementation can check itself", async () => {
    const jwk = { kty: "EC", crv: "P-256", x: "x-coordinate", y: "y-coordinate" };
    const fp = await userKeyFingerprint(jwk);
    const input = new TextEncoder().encode("klef/user-key/v1\nP-256\nx-coordinate\ny-coordinate");
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input)).slice(0, 16);
    expect(fp).toBe(Buffer.from(digest).toString("hex"));
  });
});

describe("fingerprint pins", () => {
  it("round-trip under the DEK and are bound to the user", async () => {
    const dek = await newDek();
    const sealed = await sealPins(dek, "user-1", { "user-2": "ab".repeat(16) });
    expect(await openPins(dek, "user-1", sealed)).toEqual({ "user-2": "ab".repeat(16) });
    await expect(openPins(dek, "user-3", sealed)).rejects.toThrow();
    expect(await openPins(dek, "user-1", null)).toEqual({});
  });

  it("tells new, matching and changed keys apart", () => {
    const pins = { "user-2": "aa" };
    expect(checkPin(pins, "user-3", "aa")).toBe("new");
    expect(checkPin(pins, "user-2", "aa")).toBe("match");
    expect(checkPin(pins, "user-2", "bb")).toBe("changed");
  });
});
