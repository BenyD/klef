import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearToken, loadToken, saveToken, validateToken } from "./credentials.ts";
import { generateToken } from "../shared/access-token-format.ts";

// KLEF_NO_KEYCHAIN keeps every case on the file path: a test run must never
// read or write the developer's real OS keychain.
let dir: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "klef-cred-"));
  env = { KLEF_CONFIG_DIR: dir, KLEF_NO_KEYCHAIN: "1" };
});

afterEach(async () => {
  await clearToken(env);
});

describe("token storage", () => {
  it("reads back what it stored", async () => {
    const token = generateToken();
    expect(await saveToken(token, env)).toBe("file");
    expect(await loadToken(env)).toEqual({ token, source: "file" });
  });

  it("reports no token before anything is saved", async () => {
    expect(await loadToken(env)).toBeNull();
  });

  it("writes the credentials file owner-only", async () => {
    await saveToken(generateToken(), env);
    const info = await stat(path.join(dir, "credentials.json"));
    expect(info.mode & 0o777).toBe(0o600);
  });

  it("tightens permissions on an existing world-readable file", async () => {
    const file = path.join(dir, "credentials.json");
    await writeFile(file, "{}", { mode: 0o644 });
    await saveToken(generateToken(), env);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it("overwrites a previous token rather than appending", async () => {
    await saveToken(generateToken(), env);
    const second = generateToken();
    await saveToken(second, env);
    expect((await loadToken(env))?.token).toBe(second);
  });

  it("clears the token", async () => {
    await saveToken(generateToken(), env);
    await clearToken(env);
    expect(await loadToken(env)).toBeNull();
  });

  it("is safe to clear when nothing is stored", async () => {
    await expect(clearToken(env)).resolves.toBeUndefined();
  });

  it("lets an environment token win, for CI", async () => {
    const stored = generateToken();
    await saveToken(stored, env);
    const fromEnv = generateToken();

    const loaded = await loadToken({ ...env, KLEF_TOKEN: fromEnv });
    expect(loaded).toEqual({ token: fromEnv, source: "environment" });
  });

  it("ignores a blank environment token", async () => {
    const stored = generateToken();
    await saveToken(stored, env);
    expect((await loadToken({ ...env, KLEF_TOKEN: "   " }))?.token).toBe(stored);
  });

  it("treats a corrupt credentials file as signed out", async () => {
    await writeFile(path.join(dir, "credentials.json"), "not json", { mode: 0o600 });
    expect(await loadToken(env)).toBeNull();
  });

  it("treats a file without a token field as signed out", async () => {
    await writeFile(path.join(dir, "credentials.json"), '{"nope":1}', { mode: 0o600 });
    expect(await loadToken(env)).toBeNull();
  });

  it("stores the token and nothing else", async () => {
    const token = generateToken();
    await saveToken(token, env);
    const raw = await readFile(path.join(dir, "credentials.json"), "utf8");
    expect(Object.keys(JSON.parse(raw))).toEqual(["token"]);
  });
});

describe("validateToken", () => {
  it("accepts a real token and trims it", () => {
    const token = generateToken();
    expect(validateToken(`  ${token}\n`)).toBe(token);
  });

  it("rejects anything that isn't a Klef token, with a pointer to the UI", () => {
    for (const bad of ["", "hunter2", "github_pat_11ABC", "klef_pat_short"]) {
      expect(() => validateToken(bad)).toThrow(/klef_pat_/);
    }
  });
});
