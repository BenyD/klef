import { describe, expect, it } from "vitest";
import { pixelField, seeded } from "./pixel-field.ts";

describe("pixelField", () => {
  const opts = { cols: 20, rows: 12, count: 70, seed: 7 };

  it("is deterministic for a seed, so the server and the browser agree", () => {
    expect(pixelField(opts)).toEqual(pixelField(opts));
    expect(pixelField(opts)).not.toEqual(pixelField({ ...opts, seed: 8 }));
  });

  it("places every cell inside the grid, no two in the same place", () => {
    const cells = pixelField(opts);
    expect(cells).toHaveLength(70);
    const keys = new Set(cells.map((c) => `${c.col},${c.row}`));
    expect(keys.size).toBe(70);
    for (const c of cells) {
      expect(c.col).toBeGreaterThanOrEqual(0);
      expect(c.col).toBeLessThan(20);
      expect(c.row).toBeGreaterThanOrEqual(0);
      expect(c.row).toBeLessThan(12);
    }
  });

  it("never asks for more cells than the grid holds", () => {
    expect(pixelField({ cols: 3, rows: 2, count: 50, seed: 1 })).toHaveLength(6);
  });

  it("keeps movers two cells clear of the edges, so their loop stays in the field", () => {
    const cells = pixelField({ ...opts, count: 200, cols: 10, rows: 10 });
    for (const c of cells.filter((c) => c.walk)) {
      expect(c.col).toBeGreaterThan(1);
      expect(c.row).toBeGreaterThan(1);
      expect(c.col).toBeLessThan(8);
      expect(c.row).toBeLessThan(8);
    }
  });

  it("gives every cell a breath that starts mid-way and a staggered entrance", () => {
    for (const c of pixelField(opts)) {
      expect(c.floor).toBeLessThan(c.peak);
      expect(c.peak).toBeLessThanOrEqual(0.7);
      expect(c.delay).toBeLessThanOrEqual(0);
      expect(c.enter % 90).toBe(0);
      expect(c.enter).toBeLessThan(1000);
    }
  });

  it("seeded() is a stable sequence in (0, 1)", () => {
    const a = seeded(42);
    const b = seeded(42);
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });
});
