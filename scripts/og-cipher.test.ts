import { describe, expect, it } from "vitest";
import { TOKEN_LENGTH, cipherGrid, mulberry32 } from "./og-cipher.ts";

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("stays in [0, 1)", () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const n = rand();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});

describe("cipherGrid", () => {
  it("reproduces the same grid for the same seed", () => {
    expect(cipherGrid(1, 12, 10)).toEqual(cipherGrid(1, 12, 10));
  });

  it("has the requested dimensions and fixed-width tokens", () => {
    const grid = cipherGrid(3, 5, 8);
    expect(grid).toHaveLength(5);
    for (const row of grid) {
      expect(row).toHaveLength(8);
      for (const token of row) {
        expect(token.text).toHaveLength(TOKEN_LENGTH);
        expect(token.shade).toBeGreaterThanOrEqual(0);
        expect(token.shade).toBeLessThan(1);
      }
    }
  });

  it("mixes env names into the ciphertext", () => {
    const tokens = cipherGrid(9, 20, 10).flat();
    const kinds = new Set(tokens.map((t) => t.kind));
    expect(kinds).toEqual(new Set(["junk", "env"]));
  });
});
