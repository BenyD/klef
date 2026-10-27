import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkMinVersion, compareVersions } from "./min-version.ts";
import { parseProjectConfig } from "./project-config.ts";

describe("minVersion", () => {
  it("compares versions numerically", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.6.0", "0.7.0")).toBeLessThan(0);
  });

  it("refuses an older CLI with the command to run instead", () => {
    expect(() => checkMinVersion("0.7.0", "0.7.0", "pull")).not.toThrow();
    expect(() => checkMinVersion("0.8.0", "0.7.0", "pull")).not.toThrow();
    expect(() => checkMinVersion("0.6.0", undefined, "pull")).not.toThrow();
    try {
      checkMinVersion("0.6.0", "0.7.0", "pull --all");
      expect.unreachable();
    } catch (err) {
      expect(err).toMatchObject({
        code: "outdated",
        message: "This repo expects klef 0.7.0 or newer; this is 0.6.0.",
        next: [{ command: "npx @klefsh/cli@latest pull --all" }],
      });
    }
  });

  it("is read from .klef.json, and must look like a version", () => {
    const base = { workspace: "w", project: "p", file: ".env" };
    expect(parseProjectConfig(JSON.stringify({ ...base, minVersion: "0.7.0" })).minVersion).toBe("0.7.0");
    expect(() => parseProjectConfig(JSON.stringify({ ...base, minVersion: "latest" }))).toThrow(/minVersion/);
  });

  it("stops the real CLI before it does anything, with no network", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "klef-min-"));
    try {
      await writeFile(path.join(dir, ".klef.json"), JSON.stringify({ workspace: "w", project: "p", file: ".env", minVersion: "99.0.0" }));
      const res = spawnSync(process.execPath, [path.join(import.meta.dirname, "index.ts"), "status"], {
        cwd: dir,
        encoding: "utf8",
        env: { PATH: process.env.PATH, KLEF_API_URL: "http://127.0.0.1:9", KLEF_CONFIG_DIR: path.join(dir, ".c") },
      });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("This repo expects klef 99.0.0 or newer");
      expect(res.stderr).toContain("npx @klefsh/cli@latest status");
      // Help and --version still answer, so a person can see what they have.
      const v = spawnSync(process.execPath, [path.join(import.meta.dirname, "index.ts"), "--version"], { cwd: dir, encoding: "utf8" });
      expect(v.status).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
