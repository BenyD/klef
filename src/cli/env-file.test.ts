import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLocalFile, writeEnvFile } from "./env-file.ts";
import { writeKey } from "./commands/set.ts";
import { recordSynced, loadSyncState } from "./sync-state.ts";
import { childEnv } from "./run-tool.ts";

// Where plaintext lands, and how: only a regular file inside the directory,
// written whole or not at all, owner-only from the first byte.

let root: string;
let outside: string;

beforeEach(async () => {
  const base = await mkdtemp(path.join(tmpdir(), "klef-env-file-"));
  root = path.join(base, "repo");
  outside = path.join(base, "outside");
  await mkdir(root);
  await mkdir(outside);
});

afterEach(async () => {
  await rm(path.dirname(root), { recursive: true, force: true });
});

describe("writeEnvFile", () => {
  it("writes owner-only, even over a file that was world-readable, and leaves no temp file", async () => {
    const file = path.join(root, ".env.local");
    await writeFile(file, "OLD=1\n");
    await chmod(file, 0o644);
    await writeEnvFile(file, "NEW=1\n", root);
    expect(await readFile(file, "utf8")).toBe("NEW=1\n");
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readdir(root)).toEqual([".env.local"]);
  });

  it("refuses a symlink, and leaves its target alone", async () => {
    const target = path.join(outside, "zshrc");
    await writeFile(target, "export PATH=/usr/bin\n");
    await symlink(target, path.join(root, ".env.local"));
    await expect(writeEnvFile(path.join(root, ".env.local"), "SECRET=x\n", root)).rejects.toMatchObject({ code: "unsafe_path" });
    expect(await readFile(target, "utf8")).toBe("export PATH=/usr/bin\n");
  });

  it("refuses a folder that leads outside the directory through a symlink", async () => {
    await symlink(outside, path.join(root, "config"));
    await expect(writeEnvFile(path.join(root, "config", ".env"), "SECRET=x\n", root)).rejects.toMatchObject({ code: "unsafe_path" });
    expect(await readdir(outside)).toEqual([]);
  });

  it("refuses something that is not a regular file", async () => {
    await mkdir(path.join(root, ".env.local"));
    await expect(writeEnvFile(path.join(root, ".env.local"), "SECRET=x\n", root)).rejects.toMatchObject({ code: "unsafe_path" });
  });
});

describe("readLocalFile", () => {
  it("reads UTF-8 and reports a missing file as null", async () => {
    await writeFile(path.join(root, ".env"), "NAME=Zoë\n");
    expect((await readLocalFile(path.join(root, ".env")))?.text).toBe("NAME=Zoë\n");
    expect(await readLocalFile(path.join(root, "missing"))).toBeNull();
  });

  it("refuses bytes that are not UTF-8, rather than changing them on the way up", async () => {
    await writeFile(path.join(root, ".env"), Buffer.from([0x4e, 0x3d, 0xe9, 0x0a])); // "N=" + Latin-1 é
    await expect(readLocalFile(path.join(root, ".env"))).rejects.toMatchObject({ code: "usage" });
  });
});

describe("set", () => {
  it("starts from empty only for a missing file; any other read failure writes nothing", async () => {
    await writeKey(path.join(root, ".env.new"), "A", "1", root);
    expect(await readFile(path.join(root, ".env.new"), "utf8")).toBe("A=1\n");

    // Unreadable bytes must not turn into an empty file that `set` then replaces.
    const file = path.join(root, ".env.local");
    const original = Buffer.from([0x4b, 0x3d, 0xff, 0x0a]);
    await writeFile(file, original);
    await expect(writeKey(file, "A", "1", root)).rejects.toBeDefined();
    expect(await readFile(file)).toEqual(original);
  });
});

describe("recordSynced", () => {
  it("records the file as it was read when told, not as it is now", async () => {
    const env = { KLEF_CONFIG_DIR: path.join(root, "..", "config") };
    const file = path.join(root, ".env");
    await writeFile(file, "A=1\nB=2\n");
    await recordSynced(env, [{ file, versionId: "v1", seen: { mtimeMs: 1, size: 4 } }]);
    expect((await loadSyncState(env))[file]).toEqual({ versionId: "v1", mtimeMs: 1, size: 4 });
  });
});

describe("childEnv", () => {
  it("keeps Klef's token out of programs it starts", () => {
    expect(childEnv({ KLEF_TOKEN: "klef_pat_x", PATH: "/bin" })).toEqual({ PATH: "/bin" });
  });
});
