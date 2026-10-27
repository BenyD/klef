import { describe, expect, it } from "vitest";
import { generateSealKeypair, openToken, sealToken } from "./device-seal.ts";
import { isSealedVaultKey, openVaultKey, sealVaultKey, type SealedVaultKey } from "./device-unlock.ts";
import {
  decryptBlob,
  dekBytesWithKekBytes,
  dekBytesWithPassphrase,
  deriveKekBytes,
  encryptBlob,
  importAesKey,
  setupVault,
} from "./crypto.ts";

const binding = { userCode: "WXYZ-2345", userId: "user-1" };
const dek = () => crypto.getRandomValues(new Uint8Array(32));

describe("sealVaultKey / openVaultKey", () => {
  it("hands the DEK's bytes to the CLI that holds the private key", async () => {
    const cli = await generateSealKeypair();
    const bytes = dek();
    const sealed = await sealVaultKey(cli.publicJwk, bytes, binding);
    expect(await openVaultKey(cli.privateKey, cli.publicJwk, sealed, binding)).toEqual(bytes);
  });

  it("stores nothing the server could open: no key bytes in the clear, and another key pair fails", async () => {
    const cli = await generateSealKeypair();
    const bytes = dek();
    const sealed = await sealVaultKey(cli.publicJwk, bytes, binding);
    const stored = JSON.stringify(sealed);
    expect(stored).not.toContain(Buffer.from(bytes).toString("base64"));
    expect(stored).not.toContain(Buffer.from(bytes).toString("hex"));

    const server = await generateSealKeypair();
    await expect(openVaultKey(server.privateKey, cli.publicJwk, sealed, binding)).rejects.toThrow();
  });

  it("fails for another user code, another user, or another device key", async () => {
    const cli = await generateSealKeypair();
    const other = await generateSealKeypair();
    const sealed = await sealVaultKey(cli.publicJwk, dek(), binding);
    await expect(openVaultKey(cli.privateKey, cli.publicJwk, sealed, { ...binding, userCode: "WXYZ-2346" })).rejects.toThrow();
    await expect(openVaultKey(cli.privateKey, cli.publicJwk, sealed, { ...binding, userId: "user-2" })).rejects.toThrow();
    await expect(openVaultKey(cli.privateKey, other.publicJwk, sealed, binding)).rejects.toThrow();
  });

  it("reads the user code however it is typed", async () => {
    const cli = await generateSealKeypair();
    const bytes = dek();
    const sealed = await sealVaultKey(cli.publicJwk, bytes, binding);
    expect(await openVaultKey(cli.privateKey, cli.publicJwk, sealed, { ...binding, userCode: "wxyz2345" })).toEqual(bytes);
  });

  it("rejects a blob that was altered", async () => {
    const cli = await generateSealKeypair();
    const sealed = await sealVaultKey(cli.publicJwk, dek(), binding);
    const bytes = Buffer.from(sealed.ciphertext, "base64");
    bytes[0] = bytes[0]! ^ 1;
    const tampered: SealedVaultKey = { ...sealed, ciphertext: bytes.toString("base64") };
    await expect(openVaultKey(cli.privateKey, cli.publicJwk, tampered, binding)).rejects.toThrow();
  });

  it("cannot be opened as a token, nor a token as a vault key", async () => {
    const cli = await generateSealKeypair();
    const sealed = await sealVaultKey(cli.publicJwk, dek(), binding);
    await expect(openToken(cli.privateKey, sealed)).rejects.toThrow();
    const token = await sealToken(cli.publicJwk, "klef_pat_x");
    await expect(openVaultKey(cli.privateKey, cli.publicJwk, { v: 1, ...token }, binding)).rejects.toThrow();
  });

  it("carries a real vault's DEK: what the CLI opens decrypts the vault's blobs", async () => {
    const vault = await setupVault("correct horse battery staple");
    const blob = await encryptBlob(vault.dek, "API_KEY=sk_live_x\n");
    const bytes = await dekBytesWithPassphrase("correct horse battery staple", vault.keyMaterial.kdfParams, vault.keyMaterial.wrappedDek);
    const cli = await generateSealKeypair();
    const sealed = await sealVaultKey(cli.publicJwk, bytes, binding);
    const opened = await openVaultKey(cli.privateKey, cli.publicJwk, sealed, binding);
    expect(await decryptBlob(await importAesKey(opened), blob)).toBe("API_KEY=sk_live_x\n");
  });
});

describe("dekBytes helpers", () => {
  it("agree with each other and reject a wrong passphrase", async () => {
    const vault = await setupVault("pass one");
    const { kdfParams, wrappedDek } = vault.keyMaterial;
    const a = await dekBytesWithPassphrase("pass one", kdfParams, wrappedDek);
    const b = await dekBytesWithKekBytes(await deriveKekBytes("pass one", kdfParams), wrappedDek);
    expect(a).toEqual(b);
    await expect(dekBytesWithPassphrase("pass two", kdfParams, wrappedDek)).rejects.toThrow();
  });
});

describe("isSealedVaultKey", () => {
  it("accepts a real one and rejects shapes that are not", async () => {
    const cli = await generateSealKeypair();
    const sealed = await sealVaultKey(cli.publicJwk, dek(), binding);
    expect(isSealedVaultKey(sealed)).toBe(true);
    expect(isSealedVaultKey({ ...sealed, v: 2 })).toBe(false);
    expect(isSealedVaultKey({ ...sealed, ciphertext: "x".repeat(1000) })).toBe(false);
    expect(isSealedVaultKey({ ...sealed, ephemeralPublicJwk: { kty: "RSA" } })).toBe(false);
    expect(isSealedVaultKey(null)).toBe(false);
  });
});
