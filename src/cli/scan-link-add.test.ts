import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "./args.ts";
import { link } from "./commands/link.ts";
import { scan } from "./commands/scan.ts";
import { findEnvFiles, isEnvFileName, scanAgainst, vaultNameFor } from "./env-scan.ts";
import { resetUi, setUiMode } from "./ui.ts";

let cwd: string;
let output: string[];
// No global or system git config: a developer's global excludes (which often
// ignore .env everywhere) must not decide what these tests see.
const env = { PATH: process.env.PATH, HOME: "/nonexistent", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };

beforeEach(async () => {
  cwd = await mkdtemp(path.join(tmpdir(), "klef-scan-"));
  output = [];
  const capture = (...parts: unknown[]) => void output.push(parts.join(" "));
  vi.spyOn(console, "log").mockImplementation(capture);
  vi.spyOn(console, "error").mockImplementation(capture);
});

afterEach(async () => {
  vi.restoreAllMocks();
  resetUi();
  await rm(cwd, { recursive: true, force: true });
});

async function touch(rel: string, text = "A=1\n") {
  await mkdir(path.dirname(path.join(cwd, rel)), { recursive: true });
  await writeFile(path.join(cwd, rel), text);
}

describe("env file names", () => {
  it("knows env files from their templates", () => {
    for (const n of [".env", ".env.local", ".env.production", "app.env", ".env.staging.local"]) expect(isEnvFileName(n), n).toBe(true);
    for (const n of [".env.example", ".env.sample", ".env.template", "env.ts", ".envrc", "app.env.example"]) expect(isEnvFileName(n), n).toBe(false);
  });

  it("names a vault file after its folder unless it is at the root", () => {
    expect(vaultNameFor(".env.production", [".env.local"])).toBe(".env.production");
    expect(vaultNameFor("apps/mobile/.env.local", [".env.local"])).toBe("mobile.env.local");
    expect(vaultNameFor("apps/api/.env", [])).toBe("api.env");
    expect(vaultNameFor("apps/mobile/.env.local", ["mobile.env.local"])).toBeNull();
  });
});

describe("klef scan", () => {
  it("lists env files .klef.json does not cover, and which git ignores", async () => {
    spawnSync("git", ["init", "-q"], { cwd, env });
    await writeFile(path.join(cwd, ".gitignore"), ".env.local\napps/web/.env.local\n");
    await writeFile(path.join(cwd, ".klef.json"), JSON.stringify({ workspace: "w", project: "p", file: ".env.local", environment: null }));
    await touch(".env.local");
    await touch(".env.example");
    await touch("apps/web/.env.local");
    await touch("apps/api/.env");
    await touch("node_modules/pkg/.env");

    expect(await findEnvFiles(cwd)).toEqual([".env.local", "apps/api/.env", "apps/web/.env.local"]);
    setUiMode({ json: true }, "scan");
    expect(await scan(parseArgs(["scan"]), env, cwd)).toBe(0);
    const { data } = JSON.parse(output.join("\n"));
    expect(data).toEqual({
      linked: true,
      gitRepository: true,
      unlisted: [
        { path: "apps/api/.env", ignored: false },
        { path: "apps/web/.env.local", ignored: true },
      ],
      listed: [".env.local"],
    });
  });

  it("warns about a file git would commit", async () => {
    spawnSync("git", ["init", "-q"], { cwd, env });
    await touch("apps/api/.env");
    await scan(parseArgs(["scan"]), env, cwd);
    expect(output.join("\n")).toContain("NOT ignored by git");
    expect(output.join("\n")).toContain("can be committed");
  });

  it("works outside git, saying nothing about ignoring", () => {
    expect(scanAgainst(null, [".env"], null)).toEqual({ unlisted: [{ path: ".env", ignored: null }], listed: [] });
  });
});

describe("klef link --add", () => {
  beforeEach(async () => {
    await writeFile(path.join(cwd, ".klef.json"), JSON.stringify({ workspace: "w", project: "p", file: ".env.local", environment: null }));
  });
  const config = async () => JSON.parse(await readFile(path.join(cwd, ".klef.json"), "utf8"));

  it("lists the file, keeping the linked one first", async () => {
    expect(await link(parseArgs(["link", "--add", "apps/web/.env.local"]), {}, cwd)).toBe(0);
    expect((await config()).files).toEqual([
      { file: ".env.local", path: ".env.local" },
      { file: "web.env.local", path: "apps/web/.env.local" },
    ]);
    expect(output[0]).toBe("✓ Added apps/web/.env.local to .klef.json, as web.env.local in the vault");
  });

  it("takes a name with --as, is a no-op the second time, and refuses a path outside", async () => {
    await link(parseArgs(["link", "--add", "apps/web/.env.local", "--as", "web.env"]), {}, cwd);
    expect((await config()).files[1]).toEqual({ file: "web.env", path: "apps/web/.env.local" });
    output = [];
    expect(await link(parseArgs(["link", "--add", "apps/web/.env.local"]), {}, cwd)).toBe(0);
    expect(output[0]).toBe("✓ apps/web/.env.local is already listed");
    await expect(link(parseArgs(["link", "--add", "../other/.env"]), {}, cwd)).rejects.toMatchObject({ code: "unsafe_path" });
  });
});
