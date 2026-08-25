// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The motion vocabulary, mirrored for animation that runs from JS (WAAPI,
// inline styles) rather than from a class. global.css is the source of truth:
// reading the custom property off the document at call time would work in the
// browser but not during prerender or in tests, and these values are part of
// the design language rather than a runtime setting. motion.test.ts asserts
// the two never drift apart.

/** Entering, leaving, travelling. The app's signature curve. */
export const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
/** Small state flips: hover, press, icon swaps. */
export const EASE_QUICK = "cubic-bezier(0.2, 0, 0, 1)";
/** Movement that starts and ends at rest. */
export const EASE_IN_OUT = "cubic-bezier(0.4, 0, 0.2, 1)";

/** Milliseconds, matching --duration-* in global.css. */
export const DURATION_FAST = 120;
export const DURATION_BASE = 180;
export const DURATION_SLOW = 260;
