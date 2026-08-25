// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { REVEAL_R, REVEAL_X, REVEAL_Y, switchTheme } from "./theme.ts";

// The real Document type declares startViewTransition as required and fully
// typed; these tests only need the sliver switchTheme touches.
type Doc = { startViewTransition?: unknown };

function stubViewport(width: number, height: number) {
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("innerHeight", height);
}

function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: reduced })),
  );
}

/** Installs a fake View Transition API; returns the captured callback. */
function stubViewTransition() {
  const calls: Array<() => void> = [];
  (document as unknown as Doc).startViewTransition = (cb: () => void) => {
    calls.push(cb);
    return { ready: Promise.resolve() };
  };
  return calls;
}

function reveal() {
  const style = document.documentElement.style;
  return {
    x: style.getPropertyValue(REVEAL_X),
    y: style.getPropertyValue(REVEAL_Y),
    r: style.getPropertyValue(REVEAL_R),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (document as unknown as Doc).startViewTransition;
  document.documentElement.removeAttribute("style");
});

describe("switchTheme", () => {
  it("expands from the click point out to the farthest viewport corner", () => {
    stubViewport(800, 600);
    stubReducedMotion(false);
    const transitions = stubViewTransition();
    const setTheme = vi.fn();

    switchTheme("dark", setTheme, { x: 200, y: 100 });

    // Farthest corner from (200, 100) is (800, 600): hypot(600, 500).
    expect(reveal()).toEqual({
      x: "200px",
      y: "100px",
      r: `${Math.hypot(600, 500)}px`,
    });
    expect(transitions).toHaveLength(1);

    // The theme only flips inside the transition callback, so the browser
    // captures the old snapshot first.
    expect(setTheme).not.toHaveBeenCalled();
    transitions[0]!();
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("falls back to the top-centre of the viewport without an origin", () => {
    stubViewport(800, 600);
    stubReducedMotion(false);
    stubViewTransition();

    switchTheme("light", vi.fn());

    expect(reveal()).toEqual({
      x: "400px",
      y: "0px",
      r: `${Math.hypot(400, 600)}px`,
    });
  });

  it("switches instantly when the View Transition API is missing", () => {
    stubViewport(800, 600);
    stubReducedMotion(false);
    const setTheme = vi.fn();

    switchTheme("dark", setTheme, { x: 10, y: 10 });

    expect(setTheme).toHaveBeenCalledWith("dark");
    expect(reveal()).toEqual({ x: "", y: "", r: "" });
  });

  it("switches instantly under prefers-reduced-motion", () => {
    stubViewport(800, 600);
    stubReducedMotion(true);
    const transitions = stubViewTransition();
    const setTheme = vi.fn();

    switchTheme("dark", setTheme, { x: 10, y: 10 });

    expect(setTheme).toHaveBeenCalledWith("dark");
    expect(transitions).toHaveLength(0);
    expect(reveal()).toEqual({ x: "", y: "", r: "" });
  });
});
