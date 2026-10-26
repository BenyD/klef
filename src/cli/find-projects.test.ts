import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findProjects } from "./find-projects.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "klef-find-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function linked(...parts: string[]): Promise<string> {
  const dir = path.join(root, ...parts);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, ".klef.json"), "{}");
  return dir;
}

describe("findProjects", () => {
  it("finds linked checkouts at any depth up to the limit, sorted", async () => {
    const b = await linked("b");
    const a = await linked("org", "a");
    const nested = await linked("org", "a", "apps", "web");
    expect(await findProjects(root)).toEqual([a, nested, b].sort());
  });

  it("includes the root itself", async () => {
    await writeFile(path.join(root, ".klef.json"), "{}");
    expect(await findProjects(root)).toEqual([root]);
  });

  it("skips dependencies, hidden directories, and anything too deep", async () => {
    await linked("app", "node_modules", "pkg");
    await linked(".cache", "x");
    await linked("1", "2", "3", "4", "5");
    expect(await findProjects(root)).toEqual([]);
  });

  it("does not follow symlinks", async () => {
    const real = await linked("real");
    await symlink(real, path.join(root, "alias"));
    expect(await findProjects(root)).toEqual([real]);
  });
});
