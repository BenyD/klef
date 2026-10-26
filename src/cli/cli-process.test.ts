import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The real entry point, in a child process: which stream each thing lands on,
// the exit code, and the JSON envelope. Nothing here needs the network.

const ENTRY = path.join(import.meta.dirname, "index.ts");
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "klef-cli-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function klef(args: string[], env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(process.execPath, [ENTRY, ...args], {
    cwd: dir,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: dir,
      KLEF_CONFIG_DIR: path.join(dir, ".config"),
      KLEF_NO_KEYCHAIN: "1",
      KLEF_API_URL: "http://127.0.0.1:9",
      ...env,
    },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("klef, as a process", () => {
  it("prints help on stdout and exits 0, with or without a command", () => {
    for (const args of [[], ["--help"], ["help"], ["-h"]]) {
      const { code, stdout, stderr } = klef(args);
      expect(code).toBe(0);
      expect(stdout).toMatch(/^klef \d+\.\d+\.\d+: end-to-end encrypted \.env sync/);
      expect(stderr).toBe("");
    }
  });

  it("prints a command's help for `help <command>` and `<command> --help`", () => {
    expect(klef(["help", "sync"]).stdout).toBe(klef(["sync", "--help"]).stdout);
    expect(klef(["sync", "--help"]).stdout).toContain("--dry-run");
  });

  it("prints the version, as text or JSON", () => {
    expect(klef(["--version"]).stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
    expect(klef(["-v"]).stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
    expect(JSON.parse(klef(["--version", "--json"]).stdout)).toMatchObject({ ok: true, data: { version: expect.any(String) } });
  });

  it("treats an unknown command as a usage error on stderr, exit 2", () => {
    const { code, stdout, stderr } = klef(["pul"]);
    expect(code).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain('Unknown command "pul". Did you mean "pull"?');
  });

  it("rejects a flag the command does not take", () => {
    const { code, stderr } = klef(["status", "--all"]);
    expect(code).toBe(2);
    expect(stderr).toContain("Unknown flag --all for status.");
  });

  it("puts a JSON error on stdout, and nothing on stderr", () => {
    const { code, stdout, stderr } = klef(["pull", "--json"], { KLEF_TOKEN: "klef_pat_x" });
    expect(code).toBe(6);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toMatchObject({
      schema: 1,
      ok: false,
      command: "pull",
      error: { code: "not_linked", next: [{ command: "klef link" }, { command: "klef setup" }] },
      exit: 6,
    });
  });

  it("exits 3 when not signed in", async () => {
    await writeFile(path.join(dir, ".klef.json"), JSON.stringify({ workspace: "w", project: "p", file: ".env" }));
    const { code, stderr } = klef(["pull"]);
    await rm(path.join(dir, ".klef.json"));
    expect(code).toBe(3);
    expect(stderr).toContain("✗ Not signed in.");
    expect(stderr).toContain("Run: klef login");
  });

  it("answers status --json signed out, without the network", () => {
    const { code, stdout } = klef(["status", "--json"]);
    expect(code).toBe(0);
    const { data } = JSON.parse(stdout);
    expect(data).toMatchObject({
      account: { signedIn: false, tokenStatus: "absent" },
      vault: { unlocked: false },
      project: null,
      files: [],
      next: [{ command: "klef setup" }],
    });
  });

  it("colours only when asked to, off a terminal", () => {
    expect(klef(["pul"]).stderr).not.toContain("\x1b[");
    expect(klef(["pul"], { FORCE_COLOR: "1" }).stderr).toContain("\x1b[31m");
    expect(klef(["pul"], { FORCE_COLOR: "1", NO_COLOR: "1" }).stderr).toContain("\x1b[31m");
    expect(klef(["pul", "--no-color"], { FORCE_COLOR: "1" }).stderr).not.toContain("\x1b[");
  });

  it("checks --cwd before doing anything", () => {
    const { code, stderr } = klef(["status", "-C", path.join(dir, "nope")]);
    expect(code).toBe(2);
    expect(stderr).toContain("is not a directory");
  });

  it("prints completion scripts", () => {
    expect(klef(["completion", "zsh"]).stdout).toMatch(/^#compdef klef/);
    expect(klef(["completion"]).code).toBe(2);
  });
});
