import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DURATION_BASE,
  DURATION_FAST,
  DURATION_SLOW,
  EASE_IN_OUT,
  EASE_OUT,
  EASE_QUICK,
} from "./motion.ts";

// The JS constants are a hand-kept mirror of the CSS tokens (see motion.ts).
// A mirror that can drift silently is worse than no mirror, so read the
// stylesheet and hold them to it.
const css = readFileSync(
  path.join(import.meta.dirname, "../styles/global.css"),
  "utf8",
);

function token(name: string): string {
  const match = new RegExp(`^\\s*${name}:\\s*(.+);$`, "m").exec(css);
  if (!match) throw new Error(`${name} is not defined in global.css`);
  return match[1]!.trim();
}

describe("motion tokens", () => {
  it("mirrors the easing curves declared in global.css", () => {
    expect(token("--ease-out")).toBe(EASE_OUT);
    expect(token("--ease-quick")).toBe(EASE_QUICK);
    expect(token("--ease-in-out")).toBe(EASE_IN_OUT);
  });

  it("mirrors the durations declared in global.css", () => {
    expect(token("--duration-fast")).toBe(`${DURATION_FAST}ms`);
    expect(token("--duration-base")).toBe(`${DURATION_BASE}ms`);
    expect(token("--duration-slow")).toBe(`${DURATION_SLOW}ms`);
  });

  it("keeps every UI duration inside the feedback range", () => {
    // Past ~300ms an interaction stops reading as a response and starts
    // reading as a wait.
    for (const d of [DURATION_FAST, DURATION_BASE, DURATION_SLOW]) {
      expect(d).toBeLessThanOrEqual(300);
    }
  });
});
