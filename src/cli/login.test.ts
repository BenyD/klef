import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { dekBytesWithPassphrase, encryptBlob, setupVault, type VaultSetupResult } from "../shared/crypto.ts";
import { sealToken, type DeviceJwk } from "../shared/device-seal.ts";
import { sealVaultKey } from "../shared/device-unlock.ts";
import type { EncryptedBlob } from "../shared/types.ts";
import { parseArgs } from "./args.ts";
import { login } from "./commands/login.ts";
import { pull } from "./commands/pull.ts";
import { status } from "./commands/status.ts";
import { resetUi, setUiMode } from "./ui.ts";

// `klef login` collecting a vault key the browser sealed to it, against a
// fake server that does what device.ts does: relays opaque blobs.

vi.mock("./device-login.ts", async (original) => ({
  ...(await original<typeof import("./device-login.ts")>()),
  openBrowser: () => {}, // never launch a real browser from a test
}));

const PASSPHRASE = "correct horse battery staple";
const SECRET = "sk_live_do_not_print_me";
const USER_CODE = "WXYZ-2345";

let vault: VaultSetupResult;
let cwd: string;
let env: NodeJS.ProcessEnv;
let output: string[];
let blob: EncryptedBlob;
/** What the "browser" does when it approves: given the CLI's key, seal (or not). */
let approve: (publicJwk: DeviceJwk) => Promise<unknown>;

beforeAll(async () => {
  vault = await setupVault(PASSPHRASE);
  blob = await encryptBlob(vault.dek, `API_KEY=${SECRET}\n`);
});

function json(body: unknown, statusCode = 200): Response {
  return new Response(JSON.stringify(body), { status: statusCode, headers: { "content-type": "application/json" } });
}

function fakeServer() {
  let publicJwk: DeviceJwk | null = null;
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    if (url.pathname === "/api/cli/device") {
      publicJwk = (JSON.parse(String(init!.body)) as { publicJwk: DeviceJwk }).publicJwk;
      return json({ deviceCode: "d".repeat(43), userCode: USER_CODE, verificationUri: "https://klef.test/cli", expiresIn: 600, interval: 0 });
    }
    if (url.pathname === "/api/cli/device/token") {
      return json({
        status: "ready",
        sealedToken: await sealToken(publicJwk!, "klef_pat_test"),
        sealedVaultKey: await approve(publicJwk!),
      });
    }
    if (url.pathname === "/api/me") return json({ user: { id: "u1", email: "you@example.com", name: "You" } });
    if (url.pathname === "/api/vault") return json({ exists: true, keyMaterial: vault.keyMaterial });
    if (url.pathname === "/api/tree") {
      return json({
        workspaces: [{ id: "w", name: "Personal", icon: null, createdAt: "", projects: [
          { id: "p", name: "app", framework: null, icon: null, createdAt: "", files: [
            { id: ".env.local", name: ".env.local", currentVersionId: "v1", environment: null, createdAt: "" },
          ] },
        ] }],
      });
    }
    if (url.pathname === "/api/files/.env.local/current") return json({ version: { id: "v1", blob, createdAt: "" } });
    return new Response("not found", { status: 404 });
  };
}

async function browserSeals(publicJwk: DeviceJwk, userId = "u1", userCode = USER_CODE) {
  const bytes = await dekBytesWithPassphrase(PASSPHRASE, vault.keyMaterial.kdfParams, vault.keyMaterial.wrappedDek);
  return sealVaultKey(publicJwk, bytes, { userCode, userId });
}

const never = () => Promise.reject(new Error("prompted for the passphrase"));
const keyFile = () => path.join(env.KLEF_CONFIG_DIR!, "vault-key.json");

beforeEach(async () => {
  cwd = await mkdtemp(path.join(tmpdir(), "klef-login-"));
  env = {
    KLEF_API_URL: "https://klef.test",
    KLEF_NO_KEYCHAIN: "1",
    KLEF_CONFIG_DIR: path.join(cwd, ".config"),
    KLEF_AGENT_SOCK: path.join(cwd, ".agent", "agent.sock"),
  };
  await writeFile(path.join(cwd, ".klef.json"), JSON.stringify({ workspace: "Personal", project: "app", file: ".env.local", environment: null }));
  output = [];
  approve = (jwk) => browserSeals(jwk);
  vi.stubGlobal("fetch", fakeServer());
  const capture = (...parts: unknown[]) => void output.push(parts.join(" "));
  vi.spyOn(console, "log").mockImplementation(capture);
  vi.spyOn(console, "error").mockImplementation(capture);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetUi();
  await rm(cwd, { recursive: true, force: true });
  expect(output.join("\n")).not.toContain(SECRET);
});

describe("klef login, unlocked by the browser", () => {
  it("keeps the key, so pull needs no passphrase and no agent", async () => {
    expect(await login(parseArgs(["login"]), env)).toBe(0);
    expect(output).toContain("✓ Unlocked on this device");
    expect((await stat(keyFile())).mode & 0o777).toBe(0o600);
    expect(await readFile(keyFile(), "utf8")).not.toContain(SECRET);

    expect(await pull(parseArgs(["pull"]), env, cwd, never)).toBe(0);
    expect(await readFile(path.join(cwd, ".env.local"), "utf8")).toBe(`API_KEY=${SECRET}\n`);
  });

  it("says how the vault is unlocked in status --json", async () => {
    await login(parseArgs(["login"]), env);
    output = [];
    setUiMode({ json: true }, "status");
    await status(parseArgs(["status", "--json"]), env, cwd);
    expect(JSON.parse(output.join("\n")).data.vault).toMatchObject({ unlocked: true, unlockedBy: "remembered", keyStore: "file" });
  });

  it("signs in but stays locked when the browser did not unlock", async () => {
    approve = async () => null;
    expect(await login(parseArgs(["login"]), env)).toBe(0);
    await expect(stat(keyFile())).rejects.toThrow();
    await expect(pull(parseArgs(["pull"]), env, cwd, () => Promise.reject(new Error("asked")))).rejects.toThrow("asked");
  });

  it("keeps nothing that was sealed for another user or another code", async () => {
    approve = (jwk) => browserSeals(jwk, "someone-else");
    expect(await login(parseArgs(["login"]), env)).toBe(0);
    await expect(stat(keyFile())).rejects.toThrow();

    approve = (jwk) => browserSeals(jwk, "u1", "AAAA-BBBB");
    expect(await login(parseArgs(["login"]), env)).toBe(0);
    await expect(stat(keyFile())).rejects.toThrow();
  });

  it("keeps nothing with --no-remember, and says so; --remember turns it back on", async () => {
    expect(await login(parseArgs(["login", "--no-remember"]), env)).toBe(0);
    await expect(stat(keyFile())).rejects.toThrow();
    expect(output.join("\n")).toContain("Remembering is off");
    expect(JSON.parse(await readFile(path.join(env.KLEF_CONFIG_DIR!, "config.json"), "utf8"))).toEqual({ rememberKey: false });

    expect(await login(parseArgs(["login", "--remember"]), env)).toBe(0);
    expect((await stat(keyFile())).isFile()).toBe(true);
  });
});
