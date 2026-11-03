import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { changePassphrase, decryptBlob, dekBytesWithPassphrase, encryptBlob, setupVault, type VaultSetupResult } from "../shared/crypto.ts";
import { forgetKey, loadRememberedKey, REMEMBER_DAYS, rememberedKeySource, rememberKey, writeSettings } from "./key-store.ts";

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

describe("how long the key is remembered", () => {
  const file = () => path.join(dir, "vault-key.json");
  const rewrite = async (change: (record: Record<string, unknown>) => void) => {
    const record = JSON.parse(await readFile(file(), "utf8")) as Record<string, unknown>;
    change(record);
    await writeFile(file(), JSON.stringify(record));
  };

  it("lasts REMEMBER_DAYS from the unlock that stored it", async () => {
    const before = Date.now();
    await rememberKey(env, vault.keyMaterial, await bytes());
    const { expires } = JSON.parse(await readFile(file(), "utf8")) as { expires: string };
    const days = (Date.parse(expires) - before) / 86_400_000;
    expect(days).toBeGreaterThan(REMEMBER_DAYS - 0.01);
    expect(days).toBeLessThan(REMEMBER_DAYS + 0.01);
    expect(await loadRememberedKey(env, vault.keyMaterial)).not.toBeNull();
  });

  it("is forgotten once expired, so a copy stops working too", async () => {
    await rememberKey(env, vault.keyMaterial, await bytes());
    await rewrite((r) => (r.expires = new Date(Date.now() - 1000).toISOString()));
    expect(await loadRememberedKey(env, vault.keyMaterial)).toBeNull();
    expect(await rememberedKeySource(env)).toBeNull();
  });

  it("treats a key stored before keys expired as expired", async () => {
    await rememberKey(env, vault.keyMaterial, await bytes());
    await rewrite((r) => delete r.expires);
    expect(await loadRememberedKey(env, vault.keyMaterial)).toBeNull();
  });
});
