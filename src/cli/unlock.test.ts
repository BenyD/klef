import { describe, expect, it } from "vitest";
import { setupVault, encryptBlob, decryptBlob } from "../shared/crypto.ts";
import { unlockVault, WrongPassphraseError } from "./unlock.ts";

// Exercises the real crypto core in Node, which is the assumption the entire
// CLI rests on: the same src/shared/crypto.ts the browser runs, unwrapping the
// same key material the server stores, with the server not involved.
const PASSPHRASE = "correct horse battery staple";
const answering = (value: string) => () => Promise.resolve(value);

describe("unlockVault", () => {
  it("unwraps the DEK and decrypts a blob byte-for-byte", async () => {
    const vault = await setupVault(PASSPHRASE);
    const text = "# Heading\nDATABASE_URL=postgres://localhost/app\nEMPTY=\n";
    const blob = await encryptBlob(vault.dek, text);

    const dek = await unlockVault(vault.keyMaterial, answering(PASSPHRASE));
    expect(await decryptBlob(dek, blob)).toBe(text);
  });

  it("survives the JSON round-trip the wire imposes", async () => {
    const vault = await setupVault(PASSPHRASE);
    const text = "A=1\n";
    const blob = JSON.parse(JSON.stringify(await encryptBlob(vault.dek, text)));
    const material = JSON.parse(JSON.stringify(vault.keyMaterial));

    const dek = await unlockVault(material, answering(PASSPHRASE));
    expect(await decryptBlob(dek, blob)).toBe(text);
  });

  it("rejects the wrong passphrase without leaking why", async () => {
    const vault = await setupVault(PASSPHRASE);
    await expect(unlockVault(vault.keyMaterial, answering("wrong"))).rejects.toThrow(
      WrongPassphraseError,
    );
  });

  it("treats an empty passphrase as wrong rather than deriving from it", async () => {
    const vault = await setupVault(PASSPHRASE);
    await expect(unlockVault(vault.keyMaterial, answering(""))).rejects.toThrow(
      WrongPassphraseError,
    );
  });

  it("returns a non-extractable key, so the bytes can never be printed", async () => {
    const vault = await setupVault(PASSPHRASE);
    const dek = await unlockVault(vault.keyMaterial, answering(PASSPHRASE));

    expect(dek.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", dek)).rejects.toThrow();
  });
});
