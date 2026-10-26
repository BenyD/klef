// SPDX-License-Identifier: AGPL-3.0-or-later
//
// One lock policy for every client. The web vault's inactivity auto-lock and
// the CLI's unlock agent both read this, so "the key is forgotten after 15
// idle minutes" stays true wherever the key lives. Kept free of React and DOM
// so the CLI bundle can import it without dragging the web app along.

export const AUTO_LOCK_DEFAULT_MINUTES = 15;
