import { flushSync } from "react-dom";

type ViewTransitionDocument = Document & {
  startViewTransition?: (cb: () => void) => { ready: Promise<void> };
};

/** Custom properties the reveal keyframes in global.css read. */
export const REVEAL_X = "--klef-reveal-x";
export const REVEAL_Y = "--klef-reveal-y";
export const REVEAL_R = "--klef-reveal-r";

/**
 * Switch the theme with a circular-reveal View Transition expanding from the
 * click point. Falls back to an instant switch when the API is unavailable or
 * the user prefers reduced motion.
 *
 * The reveal is a CSS animation on ::view-transition-new(root) parameterised
 * through the properties above, not a WAAPI animation attached in
 * `transition.ready.then()`. The microtask hand-off costs a frame at the exact
 * moment the transition starts, and a dropped frame there shows the swapped
 * theme whole before the circle grows - the switch reads as a stutter.
 */
export function switchTheme(
  next: "light" | "dark",
  setTheme: (theme: string) => void,
  origin?: { x: number; y: number },
) {
  const doc = document as ViewTransitionDocument;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!doc.startViewTransition || reduced) {
    setTheme(next);
    return;
  }

  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? 0;
  // Farthest viewport corner, so the circle clears the screen exactly as the
  // animation lands.
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  const root = document.documentElement;
  root.style.setProperty(REVEAL_X, `${x}px`);
  root.style.setProperty(REVEAL_Y, `${y}px`);
  root.style.setProperty(REVEAL_R, `${radius}px`);

  // flushSync so the .dark class flips before the browser captures the new
  // snapshot; a batched update races the capture and skips the reveal.
  doc.startViewTransition(() => flushSync(() => setTheme(next)));
}
