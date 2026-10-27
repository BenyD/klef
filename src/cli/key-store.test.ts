import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { changePassphrase, decryptBlob, dekBytesWithPassphrase, encryptBlob, setupVault, type VaultSetupResult } from "../shared/crypto.ts";
import { forgetKey, loadRememberedKey, rememberedKeySource, rememberKey, writeSettings } from "./key-store.ts";

let vault: VaultSetupResult;
let other: VaultSetupResult;
let dir: string;
let env: NodeJS.ProcessEnv;

beforeAll(async () => {
  vault = await setupVault("one");
  other = await setupVault("two");
});

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "klef-keys-"));
  env = { KLEF_CONFIG_DIR: dir, KLEF_API_URL: "https://klef.test" };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const bytes = () => dekBytesWithPassphrase("one", vault.keyMaterial.kdfParams, vault.keyMaterial.wrappedDek);

describe("the remembered key", () => {
  it("opens the vault it was stored for, as a non-extractable key", async () => {
    expect(await rememberKey(env, vault.keyMaterial, await bytes())).toBe("file");
    expect((await stat(path.join(dir, "vault-key.json"))).mode & 0o777).toBe(0o600);
    const loaded = await loadRememberedKey(env, vault.keyMaterial);
    expect(loaded?.key.extractable).toBe(false);
    const blob = await encryptBlob(vault.dek, "A=1\n");
    expect(await decryptBlob(loaded!.key, blob)).toBe("A=1\n");
  });

  it("survives a passphrase change, since the DEK does not change", async () => {
    await rememberKey(env, vault.keyMaterial, await bytes());
    const changed = await changePassphrase("one", "three", vault.keyMaterial.kdfParams, vault.keyMaterial.wrappedDek);
    expect(await loadRememberedKey(env, { ...vault.keyMaterial, ...changed })).not.toBeNull();
  });

  it("is ignored for another vault or another server", async () => {
    await rememberKey(env, vault.keyMaterial, await bytes());
    expect(await loadRememberedKey(env, other.keyMaterial)).toBeNull();
    expect(await loadRememberedKey({ ...env, KLEF_API_URL: "https://self.hosted" }, vault.keyMaterial)).toBeNull();
    expect(await rememberedKeySource({ ...env, KLEF_API_URL: "https://self.hosted" })).toBeNull();
  });

  it("is neither kept nor used when remembering is off", async () => {
    await writeSettings(env, { rememberKey: false });
    expect(await rememberKey(env, vault.keyMaterial, await bytes())).toBeNull();
    await writeSettings(env, { rememberKey: true });
    await rememberKey(env, vault.keyMaterial, await bytes());
    expect(await loadRememberedKey({ ...env, KLEF_NO_REMEMBER: "1" }, vault.keyMaterial)).toBeNull();
  });

  it("is forgotten", async () => {
    await rememberKey(env, vault.keyMaterial, await bytes());
    expect(await forgetKey(env)).toBe(true);
    expect(await loadRememberedKey(env, vault.keyMaterial)).toBeNull();
    expect(await forgetKey(env)).toBe(false);
  });
});
