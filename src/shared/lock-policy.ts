// SPDX-License-Identifier: MIT
//
// One lock policy for every client. The web vault's inactivity auto-lock and
// the CLI's unlock agent both read this, so "the key is forgotten after 15
// idle minutes" stays true wherever the key lives. Kept free of React and DOM
// so the CLI bundle can import it without dragging the web app along.

export const AUTO_LOCK_DEFAULT_MINUTES = 15;

// The opt-in "Keep unlocked on this device" window, and the longest a CLI
// agent may be asked to hold the key. Both are idle times: any use resets
// them, and locking ends them early.
export const REMEMBER_DEVICE_MINUTES = 7 * 24 * 60;
export const MAX_LOCK_MINUTES = REMEMBER_DEVICE_MINUTES;
