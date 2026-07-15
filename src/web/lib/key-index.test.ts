import { describe, expect, it } from "vitest";
import { buildKeyIndex, searchKeys, type KeyFile } from "./key-index.ts";

const file = (over: Partial<KeyFile> & { fileId: string; text: string }): KeyFile => ({
  fileName: ".env",
  project: "p",
  workspace: "w",
  environment: null,
  ...over,
});

describe("buildKeyIndex", () => {
  it("maps each key to every file that defines it, sorted by key", () => {
    const idx = buildKeyIndex([
      file({ fileId: "a", environment: "development", text: "API_KEY=1\nDB=2" }),
      file({ fileId: "b", environment: "production", text: "API_KEY=9" }),
    ]);
    expect(idx.map((m) => m.key)).toEqual(["API_KEY", "DB"]);
    expect(idx[0]!.locations.map((l) => l.fileId)).toEqual(["a", "b"]);
    expect(idx[1]!.locations.map((l) => l.fileId)).toEqual(["a"]);
  });

  it("counts a key once per file even if repeated", () => {
    const idx = buildKeyIndex([file({ fileId: "a", text: "K=1\nK=2" })]);
    expect(idx).toHaveLength(1);
    expect(idx[0]!.locations).toHaveLength(1);
  });
});

describe("searchKeys", () => {
  const idx = buildKeyIndex([
    file({ fileId: "a", text: "STRIPE_SECRET_KEY=1\nDATABASE_URL=2\nDEBUG=3" }),
  ]);

  it("matches case-insensitive substrings", () => {
    expect(searchKeys(idx, "stripe").map((m) => m.key)).toEqual([
      "STRIPE_SECRET_KEY",
    ]);
    expect(searchKeys(idx, "URL").map((m) => m.key)).toEqual(["DATABASE_URL"]);
  });

  it("returns the full index for an empty query", () => {
    expect(searchKeys(idx, "  ").map((m) => m.key)).toEqual([
      "DATABASE_URL",
      "DEBUG",
      "STRIPE_SECRET_KEY",
    ]);
  });

  it("returns nothing when no key matches", () => {
    expect(searchKeys(idx, "nope")).toEqual([]);
  });
});
