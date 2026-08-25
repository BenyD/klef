import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveWritePath, UnsafePathError } from "./write-path.ts";

const CWD = "/home/dev/project";

describe("resolveWritePath", () => {
  it("accepts a plain filename", () => {
    expect(resolveWritePath(CWD, ".env")).toBe(path.join(CWD, ".env"));
  });

  it("accepts a nested path inside the directory", () => {
    expect(resolveWritePath(CWD, "apps/web/.env.local")).toBe(
      path.join(CWD, "apps/web/.env.local"),
    );
  });

  it("accepts a ../ that stays inside after resolution", () => {
    expect(resolveWritePath(CWD, "apps/../.env")).toBe(path.join(CWD, ".env"));
  });

  it("accepts an explicit ./ prefix", () => {
    expect(resolveWritePath(CWD, "./.env")).toBe(path.join(CWD, ".env"));
  });

  // The whole point: an agent that can be talked into running pull must not be
  // able to choose where the plaintext lands.
  it("refuses to escape upward", () => {
    for (const escape of ["../.env", "../../etc/x", "a/../../../.env"]) {
      expect(() => resolveWritePath(CWD, escape)).toThrow(UnsafePathError);
    }
  });

  it("refuses absolute paths outright", () => {
    expect(() => resolveWritePath(CWD, "/etc/cron.d/x")).toThrow(/absolute path/);
    expect(() => resolveWritePath(CWD, "/etc/cron.d/x")).toThrow(/leave this directory/);
  });

  it("refuses a path that resolves to the directory itself", () => {
    expect(() => resolveWritePath(CWD, ".")).toThrow(UnsafePathError);
  });

  it("refuses an empty destination", () => {
    expect(() => resolveWritePath(CWD, "   ")).toThrow(UnsafePathError);
  });

  it("names the offending input, so the error is actionable", () => {
    expect(() => resolveWritePath(CWD, "../secrets.env")).toThrow(/\.\.\/secrets\.env/);
  });

  it("is not fooled by a sibling directory sharing a prefix", () => {
    // /home/dev/project-other must not count as inside /home/dev/project.
    expect(() => resolveWritePath(CWD, "../project-other/.env")).toThrow(
      UnsafePathError,
    );
  });
});
