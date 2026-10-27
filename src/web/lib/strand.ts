// The Klef mark, "Strand": three bars woven into an asterisk, the way a
// hidden value is drawn, each passing over the one before. One bar can take
// the accent colour: the strand that is yours.
//
// Geometry on a 100-unit grid: each bar is a stadium `w` wide and `len` long,
// its centre line offset `off` from the middle, turned 0, 120 and 240 degrees
// about (50, 50). Bar i is cut where bar (i + 2) % 3 passes over it, with
// `gap` of clear ground either side of the crossing strand. The cuts are
// computed into the paths themselves (two closed pieces per bar, nothing
// overlapping), so there are no masks: every renderer, from browsers to
// resvg to Illustrator, draws exactly the same weave, and the mark works in
// `currentColor` on any surface.
//
// The brand package in the design folder is generated from this same
// geometry; keep the numbers in step with it.

export type Strand = { w: number; len: number; off: number; gap: number };

/** The mark as drawn everywhere above about 48 px. */
export const STRAND: Strand = { w: 16, len: 80, off: 9, gap: 3 };

/** Bolder strands and a wider gap for 16 and 32 px favicons, where a
 *  3-unit gap would vanish. */
export const STRAND_SMALL: Strand = { w: 18, len: 80, off: 10, gap: 3.5 };

export const ANGLES = [0, 120, 240] as const;

/** Brand ember and ink, as sRGB hex for files that cannot take oklch. */
export const EMBER = "#F4823A";
export const INK = "#17181B";

type Point = [number, number];
type Axis = { c: Point; d: Point; n: Point; half: number; r: number };

const round = (n: number): number => Math.round(n * 1000) / 1000;

function rotate([x, y]: Point, deg: number, cx = 50, cy = 50): Point {
  const a = (deg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
}

/** Bar i as its centre, unit direction, unit normal, half length and radius. */
export function barAxis(i: number, s: Strand = STRAND): Axis {
  const angle = ANGLES[i % 3] ?? 0;
  const [x1, y1] = rotate([50 + s.off, 50 - s.len / 2], angle);
  const [x2, y2] = rotate([50 + s.off, 50 + s.len / 2], angle);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  return {
    c: [(x1 + x2) / 2, (y1 + y2) / 2],
    d: [dx / length, dy / length],
    n: [-dy / length, dx / length],
    half: length / 2,
    r: s.w / 2,
  };
}

/**
 * Path data for bar i: the two pieces left after the bar that crosses over
 * it, widened by the gap, is cut out. Coordinates are rounded to a
 * thousandth so the output is stable across platforms.
 */
export function strandPath(i: number, s: Strand = STRAND): string {
  const b = barAxis(i, s);
  const k = barAxis((i + 2) % 3, s);
  const reach = s.w / 2 + s.gap;
  const dot = (p: Point, q: Point) => p[0] * q[0] + p[1] * q[1];
  // A point on bar b: `side` picks the edge (-1 or 1), `t` runs along it.
  const at = (side: number, t: number): Point => [
    b.c[0] + side * b.r * b.n[0] + t * b.d[0],
    b.c[1] + side * b.r * b.n[1] + t * b.d[1],
  ];
  // Where edge `side` of bar b meets the two cut lines parallel to bar k.
  const cuts = (side: number) => {
    const edge: Point = [b.c[0] + side * b.r * b.n[0] - k.c[0], b.c[1] + side * b.r * b.n[1] - k.c[1]];
    const base = dot(edge, k.n);
    const slope = dot(b.d, k.n);
    const ts = [reach, -reach].map((c) => (c - base) / slope).sort((p, q) => p - q);
    return { lo: ts[0] ?? 0, hi: ts[1] ?? 0 };
  };
  const plus = cuts(1);
  const minus = cuts(-1);
  const p = (pt: Point) => `${round(pt[0])} ${round(pt[1])}`;
  const r = b.r;
  // Piece A runs from the start cap to the near cut line, piece B from the
  // far cut line to the end cap.
  const a = `M${p(at(-1, minus.lo))} L${p(at(-1, -b.half))} A${r} ${r} 0 0 0 ${p(at(1, -b.half))} L${p(at(1, plus.lo))} Z`;
  const z = `M${p(at(1, plus.hi))} L${p(at(1, b.half))} A${r} ${r} 0 0 0 ${p(at(-1, b.half))} L${p(at(-1, minus.hi))} Z`;
  return `${a} ${z}`;
}

/** The three bars' path data, in drawing order. The last one takes the accent. */
export function strandPaths(s: Strand = STRAND): [string, string, string] {
  return [strandPath(0, s), strandPath(1, s), strandPath(2, s)];
}

export const STRAND_PATHS = strandPaths();

/** Radius of the mark's visual extent from the grid centre. */
export function markRadius(s: Strand = STRAND): number {
  return Math.hypot(s.off, s.len / 2) + s.w / 2;
}

/**
 * The app icon: the mark, ink on a rounded ember tile. `pad` is the clear
 * ground inside the tile on the 100-unit grid, `size` sets the pixel
 * dimensions for rasterisers.
 */
export function markTileSvg({
  strand = STRAND,
  pad = 18,
  rx = 22,
  tile = EMBER,
  fg = INK,
  size,
}: {
  strand?: Strand;
  pad?: number;
  rx?: number;
  tile?: string;
  fg?: string;
  size?: number;
} = {}): string {
  const scale = round((100 - pad * 2) / 100);
  const dims = size ? ` width="${size}" height="${size}"` : "";
  const paths = strandPaths(strand)
    .map((d) => `<path fill="${fg}" d="${d}"/>`)
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${dims}>` +
    `<rect width="100" height="100" rx="${rx}" fill="${tile}"/>` +
    `<g transform="translate(${pad} ${pad}) scale(${scale})">${paths}</g>` +
    `</svg>`
  );
}
