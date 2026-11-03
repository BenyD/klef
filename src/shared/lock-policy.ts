// SPDX-License-Identifier: MIT
//
// Lock limits shared by every client. The CLI's unlock agent forgets the key
// after AUTO_LOCK_DEFAULT_MINUTES idle; the web vault has its own, longer
// default (src/web/lib/auto-lock.ts) and shares the 7-day ceiling. Kept free
// of React and DOM so the CLI bundle can import it without the web app.

export const AUTO_LOCK_DEFAULT_MINUTES = 15;

// The opt-in "Keep unlocked on this device" window, and the longest a CLI
// agent may be asked to hold the key. Both are idle times: any use resets
// them, and locking ends them early.
export const REMEMBER_DEVICE_MINUTES = 7 * 24 * 60;
export const MAX_LOCK_MINUTES = REMEMBER_DEVICE_MINUTES;
