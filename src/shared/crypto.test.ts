import { describe, expect, it } from "vitest";
import {
  changePassphrase,
  decryptBlob,
  encryptBlob,
  formatRecoveryKey,
  generateRecoveryKey,
  parseRecoveryKey,
  rotateRecoveryKey,
  setupVault,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
} from "./crypto.ts";
import { RECOVERY_KEY } from "./constants.ts";

const SAMPLE_ENV = `# Klef sample
DATABASE_URL=postgres://user:p@ss@localhost:5432/db

# multiline private key
PRIVATE_KEY="-----BEGIN KEY-----
abc
def
-----END KEY-----"
EMPTY=
UNICODE=café_☕_🔐
`;

describe("blob encryption", () => {
  it("round-trips env text byte-for-byte", async () => {
    const { dek } = await setupVault("correct horse battery staple");
    const blob = await encryptBlob(dek, SAMPLE_ENV);
    expect(await decryptBlob(dek, blob)).toBe(SAMPLE_ENV);
  });

  it("uses a fresh nonce each time (ciphertext differs)", async () => {
    const { dek } = await setupVault("pw");
    const a = await encryptBlob(dek, "SAME=value");
    const b = await encryptBlob(dek, "SAME=value");
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(await decryptBlob(dek, a)).toBe(await decryptBlob(dek, b));
  });

  it("fails to decrypt under a different DEK", async () => {
    const v1 = await setupVault("pw1");
    const v2 = await setupVault("pw2");
    const blob = await encryptBlob(v1.dek, "SECRET=1");
    await expect(decryptBlob(v2.dek, blob)).rejects.toThrow();
  });
});

describe("vault setup + unlock", () => {
  it("unlocks with the passphrase and decrypts setup-era blobs", async () => {
    const passphrase = "a long enough passphrase";
    const { keyMaterial, dek } = await setupVault(passphrase);
    const blob = await encryptBlob(dek, SAMPLE_ENV);

    const unlocked = await unlockWithPassphrase(
      passphrase,
      keyMaterial.kdfParams,
      keyMaterial.wrappedDek,
    );
    expect(await decryptBlob(unlocked, blob)).toBe(SAMPLE_ENV);
  });

  it("rejects the wrong passphrase", async () => {
    const { keyMaterial } = await setupVault("right-passphrase");
    await expect(
      unlockWithPassphrase("wrong-passphrase", keyMaterial.kdfParams, keyMaterial.wrappedDek),
    ).rejects.toThrow();
  });

  it("server material never contains the plaintext DEK or passphrase", async () => {
    const { keyMaterial } = await setupVault("secret-pw");
    const serialized = JSON.stringify(keyMaterial);
    expect(serialized).not.toContain("secret-pw");
    // wrapped DEKs are independent ciphertexts (different nonces).
    expect(keyMaterial.wrappedDek.nonce).not.toBe(
      keyMaterial.wrappedDekRecovery.nonce,
    );
  });
});

describe("recovery key", () => {
  it("unlocks via the recovery key", async () => {
    const { keyMaterial, recoveryKey, dek } = await setupVault("pw");
    const blob = await encryptBlob(dek, SAMPLE_ENV);

    const recovered = await unlockWithRecoveryKey(
      recoveryKey,
      keyMaterial.wrappedDekRecovery,
    );
    expect(await decryptBlob(recovered, blob)).toBe(SAMPLE_ENV);
  });

  it("tolerates user formatting when entering the recovery key", async () => {
    const { keyMaterial, recoveryKey, dek } = await setupVault("pw");
    const blob = await encryptBlob(dek, "X=1");
    const messy = `  ${recoveryKey.toLowerCase().replace(/-/g, " ")}  `;
    const recovered = await unlockWithRecoveryKey(messy, keyMaterial.wrappedDekRecovery);
    expect(await decryptBlob(recovered, blob)).toBe("X=1");
  });

  it("rejects a wrong recovery key", async () => {
    const { keyMaterial } = await setupVault("pw");
    const wrong = generateRecoveryKey().display;
    await expect(
      unlockWithRecoveryKey(wrong, keyMaterial.wrappedDekRecovery),
    ).rejects.toThrow();
  });

  it("formats and parses recovery keys symmetrically", () => {
    const { bytes, display } = generateRecoveryKey();
    expect(display.startsWith(`${RECOVERY_KEY.prefix}-`)).toBe(true);
    expect(parseRecoveryKey(display)).toEqual(bytes);
    expect(parseRecoveryKey(formatRecoveryKey(bytes))).toEqual(bytes);
  });
});

describe("passphrase change (re-wrap only)", () => {
  it("new passphrase unlocks, old fails, recovery + old blobs still work", async () => {
    const { keyMaterial, recoveryKey, dek } = await setupVault("old-pw");
    const blob = await encryptBlob(dek, SAMPLE_ENV); // encrypted before the change

    const { kdfParams, wrappedDek } = await changePassphrase(
      "old-pw",
      "new-pw",
      keyMaterial.kdfParams,
      keyMaterial.wrappedDek,
    );

    // New passphrase works and decrypts pre-change blobs (DEK is unchanged).
    const viaNew = await unlockWithPassphrase("new-pw", kdfParams, wrappedDek);
    expect(await decryptBlob(viaNew, blob)).toBe(SAMPLE_ENV);

    // Old passphrase no longer unlocks the re-wrapped DEK.
    await expect(
      unlockWithPassphrase("old-pw", kdfParams, wrappedDek),
    ).rejects.toThrow();

    // Recovery key is untouched and still works.
    const viaRecovery = await unlockWithRecoveryKey(
      recoveryKey,
      keyMaterial.wrappedDekRecovery,
    );
    expect(await decryptBlob(viaRecovery, blob)).toBe(SAMPLE_ENV);

    // Re-wrap used fresh KDF salt.
    expect(kdfParams.salt).not.toBe(keyMaterial.kdfParams.salt);
  });
});

describe("recovery-key rotation (re-wrap only)", () => {
  it("new key unlocks, old key fails, passphrase + old blobs still work", async () => {
    const { keyMaterial, recoveryKey: oldKey, dek } = await setupVault("pw");
    const blob = await encryptBlob(dek, SAMPLE_ENV); // encrypted before rotation

    const { recoveryKey: newKey, wrappedDekRecovery } = await rotateRecoveryKey(
      "pw",
      keyMaterial.kdfParams,
      keyMaterial.wrappedDek,
    );

    // New recovery key unlocks the same DEK (pre-rotation blobs decrypt).
    const viaNew = await unlockWithRecoveryKey(newKey, wrappedDekRecovery);
    expect(await decryptBlob(viaNew, blob)).toBe(SAMPLE_ENV);

    // The old recovery key no longer matches the new wrapping.
    await expect(
      unlockWithRecoveryKey(oldKey, wrappedDekRecovery),
    ).rejects.toThrow();

    // The passphrase wrapping is untouched.
    const viaPassphrase = await unlockWithPassphrase(
      "pw",
      keyMaterial.kdfParams,
      keyMaterial.wrappedDek,
    );
    expect(await decryptBlob(viaPassphrase, blob)).toBe(SAMPLE_ENV);
  });

  it("requires the correct passphrase", async () => {
    const { keyMaterial } = await setupVault("right-pw");
    await expect(
      rotateRecoveryKey("wrong-pw", keyMaterial.kdfParams, keyMaterial.wrappedDek),
    ).rejects.toThrow();
  });
});
