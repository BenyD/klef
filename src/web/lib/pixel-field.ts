// The pixel field: a scatter of square cells on a grid that breathe, and a
// few that step from cell to cell or blink. Drawn behind the landing hero
// and the splash. This module only decides where the cells go and how each
// one moves; PixelField.tsx renders them and global.css animates them.
//
// Everything is derived from a seed, so the server and the browser produce
// the same field and hydration has nothing to reconcile.

export type PixelTone = "grid" | "ghost" | "ember" | "solid" | "ember-solid";
export type PixelWalk = "a" | "b" | "c" | "d";

export interface PixelCell {
  col: number;
  row: number;
  tone: PixelTone;
  /** Opacity the cell breathes between. */
  floor: number;
  peak: number;
  /** Seconds for one breath (one direction). */
  duration: number;
  /** Negative, so every cell starts mid-breath. */
  delay: number;
  /** Milliseconds until the cell first appears. */
  enter: number;
  /** Steps between cells on a loop, if the cell moves. */
  walk?: { name: PixelWalk; duration: number; delay: number };
  /** On and off instead of breathing. */
  blink: boolean;
}

export interface PixelFieldOptions {
  cols: number;
  rows: number;
  count: number;
  seed: number;
}

/** Park-Miller: small, and the same on every runtime. */
export function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const TONES: [PixelTone, number][] = [
  ["grid", 42],
  ["ghost", 26],
  ["ember", 14],
  ["solid", 10],
  ["ember-solid", 8],
];

const WALKS: PixelWalk[] = ["a", "b", "c", "d"];

function pick<T>(rnd: () => number, weighted: [T, number][]): T {
  const total = weighted.reduce((n, [, w]) => n + w, 0);
  let r = rnd() * total;
  for (const [value, weight] of weighted) {
    r -= weight;
    if (r <= 0) return value;
  }
  return weighted[weighted.length - 1]![0];
}

const round = (n: number, places = 2) => Number(n.toFixed(places));

/**
 * Lays out `count` cells on a `cols` x `rows` grid, no two in the same cell.
 * Clamps to the grid size, so a small field never loops forever.
 */
export function pixelField({ cols, rows, count, seed }: PixelFieldOptions): PixelCell[] {
  const rnd = seeded(seed);
  const taken = new Set<number>();
  const cells: PixelCell[] = [];
  const max = Math.min(count, cols * rows);
  while (cells.length < max) {
    const col = Math.floor(rnd() * cols);
    const row = Math.floor(rnd() * rows);
    const key = row * cols + col;
    if (taken.has(key)) continue;
    taken.add(key);

    const tone = pick(rnd, TONES);
    const solid = tone === "solid" || tone === "ember-solid";
    const blink = rnd() < 0.08;
    // Movers stay off the last two columns and rows, so their loop stays in
    // the field.
    const canWalk = col < cols - 2 && row < rows - 2 && row > 1 && col > 1;
    const walks = canWalk && !blink && rnd() < 0.22;

    cells.push({
      col,
      row,
      tone,
      floor: solid ? 0.1 : 0.06,
      peak: round(solid ? 0.35 + rnd() * 0.3 : 0.3 + rnd() * 0.4),
      duration: round(4 + rnd() * 10, 1),
      delay: round(-rnd() * 14, 1),
      enter: Math.floor(rnd() * 10) * 90,
      blink,
      ...(walks
        ? {
            walk: {
              name: WALKS[Math.floor(rnd() * WALKS.length)]!,
              duration: round(10 + rnd() * 8, 1),
              delay: round(-rnd() * 10, 1),
            },
          }
        : {}),
    });
  }
  return cells;
}
