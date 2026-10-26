import { mkdtemp, mkdir, chmod, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertSocketPathFits,
  checkSocketDir,
  MAX_SOCKET_PATH_BYTES,
  socketDirProblem,
  UnsafeSocketDirError,
} from "./socket-dir.ts";

const ME = 501;

describe("socketDirProblem", () => {
  it("accepts an owner-only directory of ours", () => {
    expect(socketDirProblem("/d", { uid: ME, mode: 0o40700, isDirectory: true }, ME)).toBeNull();
  });

  it("refuses a directory another user owns", () => {
    expect(socketDirProblem("/d", { uid: 0, mode: 0o40700, isDirectory: true }, ME)).toMatch(
      /another user/,
    );
  });

  it("refuses any group or world access, and says how to fix it", () => {
    for (const mode of [0o40750, 0o40701, 0o40755, 0o41777]) {
      expect(socketDirProblem("/d", { uid: ME, mode, isDirectory: true }, ME)).toMatch(
        /chmod 700/,
      );
    }
  });

  it("refuses something that is not a directory", () => {
    expect(socketDirProblem("/d", { uid: ME, mode: 0o100600, isDirectory: false }, ME)).toMatch(
      /not a directory/,
    );
  });
});

describe("checkSocketDir", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "klef-sockdir-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reports a missing directory without creating it", async () => {
    expect(await checkSocketDir(path.join(root, "run"), false)).toBe(false);
  });

  it("creates a missing directory owner-only", async () => {
    const dir = path.join(root, "run");
    expect(await checkSocketDir(dir, true)).toBe(true);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
  });

  it("refuses a directory others can enter", async () => {
    const dir = path.join(root, "loose");
    await mkdir(dir);
    await chmod(dir, 0o755);
    await expect(checkSocketDir(dir, false)).rejects.toThrow(UnsafeSocketDirError);
  });
});

describe("assertSocketPathFits", () => {
  it("accepts the default paths", () => {
    expect(() => assertSocketPathFits("/Users/someone/.config/klef/run/agent.sock")).not.toThrow();
    expect(() => assertSocketPathFits("/run/user/1000/klef-agent.sock")).not.toThrow();
  });

  it("names the override when a path is too long for the kernel", () => {
    const long = `/${"d".repeat(MAX_SOCKET_PATH_BYTES)}/agent.sock`;
    expect(() => assertSocketPathFits(long)).toThrow(/KLEF_AGENT_SOCK/);
  });
});
