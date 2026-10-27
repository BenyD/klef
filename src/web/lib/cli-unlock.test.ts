import { describe, expect, it } from "vitest";
import { generateSealKeypair } from "../../shared/device-seal.ts";
import { openVaultKey } from "../../shared/device-unlock.ts";
import { decryptBlob, encryptBlob, enrollPasskeyWrap, importAesKey, randomBytes, setupVault } from "../../shared/crypto.ts";
import { bytesToBase64 } from "../../shared/encoding.ts";
import { preferredMethod, sealVaultKeyForCli, WrongPassphraseForCliError } from "./cli-unlock.ts";

const PASSPHRASE = "correct horse battery staple";

async function fixture() {
  const vault = await setupVault(PASSPHRASE);
  const secret = randomBytes(32);
  const prfSalt = randomBytes(32);
  const wrappedDek = await enrollPasskeyWrap(PASSPHRASE, vault.keyMaterial.kdfParams, vault.keyMaterial.wrappedDek, secret);
  const passkeyWraps = [{ passkeyId: "p1", credentialId: "cred-1", prfSalt: bytesToBase64(prfSalt), wrappedDek }];
  const cli = await generateSealKeypair();
  const target = { publicJwk: cli.publicJwk, userCode: "WXYZ-2345", userId: "u1" };
  const blob = await encryptBlob(vault.dek, "API_KEY=sk_live_x\n");
  return { vault, secret, passkeyWraps, cli, target, blob };
}

async function opensBlob(f: Awaited<ReturnType<typeof fixture>>, sealed: Parameters<typeof openVaultKey>[2]) {
  const bytes = await openVaultKey(f.cli.privateKey, f.cli.publicJwk, sealed, { userCode: f.target.userCode, userId: f.target.userId });
  return decryptBlob(await importAesKey(bytes), f.blob);
}

describe("sealVaultKeyForCli", () => {
  it("seals the DEK from the passphrase, for the CLI alone", async () => {
    const f = await fixture();
    const sealed = await sealVaultKeyForCli({ kind: "passphrase", passphrase: PASSPHRASE }, f.target, {
      vault: async () => ({ exists: true, keyMaterial: f.vault.keyMaterial, passkeyWraps: f.passkeyWraps }),
      prf: () => Promise.reject(new Error("no passkey here")),
    });
    expect(await opensBlob(f, sealed)).toBe("API_KEY=sk_live_x\n");
  });

  it("seals the DEK from a passkey's PRF secret, and zeroes the secret", async () => {
    const f = await fixture();
    const secret = new Uint8Array(f.secret);
    const sealed = await sealVaultKeyForCli({ kind: "passkey" }, f.target, {
      vault: async () => ({ exists: true, keyMaterial: f.vault.keyMaterial, passkeyWraps: f.passkeyWraps }),
      prf: async () => ({ credentialId: "cred-1", secret }),
    });
    expect(await opensBlob(f, sealed)).toBe("API_KEY=sk_live_x\n");
    expect([...secret].every((b) => b === 0)).toBe(true);
  });

  it("refuses a wrong passphrase", async () => {
    const f = await fixture();
    await expect(
      sealVaultKeyForCli({ kind: "passphrase", passphrase: "nope" }, f.target, {
        vault: async () => ({ exists: true, keyMaterial: f.vault.keyMaterial }),
        prf: () => Promise.reject(new Error("unused")),
      }),
    ).rejects.toBeInstanceOf(WrongPassphraseForCliError);
  });

  it("refuses a passkey that is not set up for unlock", async () => {
    const f = await fixture();
    await expect(
      sealVaultKeyForCli({ kind: "passkey" }, f.target, {
        vault: async () => ({ exists: true, keyMaterial: f.vault.keyMaterial, passkeyWraps: f.passkeyWraps }),
        prf: async () => ({ credentialId: "someone-else", secret: randomBytes(32) }),
      }),
    ).rejects.toThrow(/not set up for unlock/);
  });
});

describe("preferredMethod", () => {
  it("offers a passkey when one can unlock, else the passphrase", () => {
    expect(preferredMethod([])).toBe("passphrase");
    expect(preferredMethod(undefined)).toBe("passphrase");
    expect(preferredMethod([{ passkeyId: "p", credentialId: "c", prfSalt: "s", wrappedDek: { v: 1, alg: "AES-GCM", nonce: "n", ciphertext: "c" } }])).toBe("passkey");
  });
});
