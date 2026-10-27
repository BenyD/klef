import { describe, expect, it } from "vitest";
import {
  ANGLES,
  STRAND,
  STRAND_PATHS,
  STRAND_SMALL,
  barAxis,
  markRadius,
  markTileSvg,
  strandPath,
  strandPaths,
} from "./strand.ts";

type Point = [number, number];

// Every vertex of a path: the M and L points and the end point of each arc.
function vertices(d: string): Point[] {
  const out: Point[] = [];
  for (const seg of d.match(/[MLA][^MLAZ]*/g) ?? []) {
    const nums = seg.slice(1).trim().split(/\s+/).map(Number);
    out.push([nums[nums.length - 2] ?? NaN, nums[nums.length - 1] ?? NaN]);
  }
  return out;
}

function rotate([x, y]: Point, deg: number): Point {
  const a = (deg * Math.PI) / 180;
  const dx = x - 50;
  const dy = y - 50;
  return [50 + dx * Math.cos(a) - dy * Math.sin(a), 50 + dx * Math.sin(a) + dy * Math.cos(a)];
}

describe("strandPath", () => {
  it("draws each bar as two closed pieces with finite coordinates", () => {
    for (const d of STRAND_PATHS) {
      expect(d.match(/M/g)).toHaveLength(2);
      expect(d.match(/Z/g)).toHaveLength(2);
      expect(d).not.toMatch(/NaN|Infinity/);
      for (const [x, y] of vertices(d)) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      }
    }
  });

  it("stays inside the 100-unit grid", () => {
    // The favicon variant is a touch wider; it only ever sits padded inside
    // a tile, so just its vertices are held to the grid.
    expect(markRadius(STRAND)).toBeLessThanOrEqual(50);
    for (const s of [STRAND, STRAND_SMALL]) {
      for (const d of strandPaths(s)) {
        for (const [x, y] of vertices(d)) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(100);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it("has threefold rotational symmetry", () => {
    for (let i = 0; i < 3; i++) {
      const next = vertices(strandPath((i + 1) % 3));
      const turned = vertices(strandPath(i)).map((p) => rotate(p, 120));
      expect(next).toHaveLength(turned.length);
      next.forEach(([x, y], j) => {
        expect(x).toBeCloseTo(turned[j]?.[0] ?? NaN, 2);
        expect(y).toBeCloseTo(turned[j]?.[1] ?? NaN, 2);
      });
    }
  });

  it("cuts each bar clear of the strand that crosses over it", () => {
    // The four cut vertices of bar i (first and last point of each piece)
    // sit exactly w / 2 + gap from the centre line of bar (i + 2) % 3.
    for (let i = 0; i < 3; i++) {
      const over = barAxis((i + 2) % 3);
      const [a, b] = strandPath(i).split(" M");
      const pieces = [vertices(a ?? ""), vertices(`M${b ?? ""}`)];
      for (const piece of pieces) {
        for (const p of [piece[0], piece[piece.length - 1]]) {
          const [x, y] = p ?? [NaN, NaN];
          const distance = Math.abs((x - over.c[0]) * over.n[0] + (y - over.c[1]) * over.n[1]);
          expect(distance).toBeCloseTo(STRAND.w / 2 + STRAND.gap, 2);
        }
      }
    }
  });

  it("is the geometry the brand package was generated from", () => {
    expect(ANGLES).toEqual([0, 120, 240]);
    expect(STRAND_PATHS[0]).toBe(
      "M67 17.091 L67 10 A8 8 0 0 0 51 10 L51 26.329 Z M51 51.732 L51 90 A8 8 0 0 0 67 90 L67 42.494 Z",
    );
  });
});

describe("markTileSvg", () => {
  it("puts the three bars on a rounded ember tile", () => {
    const svg = markTileSvg();
    expect(svg).toContain('<rect width="100" height="100" rx="22" fill="#F4823A"/>');
    expect(svg.match(/<path /g)).toHaveLength(3);
    expect(svg).toContain('transform="translate(18 18) scale(0.64)"');
    expect(svg).toContain('viewBox="0 0 100 100"><rect');
  });

  it("takes a strand variant, padding and pixel size", () => {
    const svg = markTileSvg({ strand: STRAND_SMALL, pad: 14, size: 32 });
    expect(svg).toContain('width="32" height="32"');
    expect(svg).toContain('transform="translate(14 14) scale(0.72)"');
    expect(svg).toContain(strandPath(0, STRAND_SMALL));
  });
});
