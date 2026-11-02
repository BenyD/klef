// SPDX-License-Identifier: MIT
//
// Whose wraps to trust. A wrap is authenticated to its sender's key
// (team-keys.ts), but the server is the one that says which key belongs to
// whom. So a client also checks the sender is someone entitled to give out
// keys, and that a person's key has not changed since it was first seen
// (trust on first use, kept in the user's encrypted pins, user-key.ts).
//
// - A current owner or admin of the team: trusted, and pinned if new.
// - Anyone else (a member, or someone who has left): trusted only if this
//   exact key was pinned for them before, which is how wraps made by an
//   admin who has since left keep opening for the people who saw them.
// - A pinned person presenting a different key: refused. That is what a
//   server swapping in a key of its own looks like.

import type { FingerprintPins } from "./user-key.ts";

export interface SenderInfo {
  userId: string;
  /** Their role in the team now; null once they have left. */
  role: "owner" | "admin" | "member" | null;
}

export type SenderVerdict =
  | { ok: true; pin: { userId: string; fingerprint: string } | null }
  | { ok: false; reason: "unknown" | "changed" | "not-admin" };

export function trustSender(fingerprint: string, info: SenderInfo | undefined, pins: FingerprintPins): SenderVerdict {
  if (!info) return { ok: false, reason: "unknown" };
  const pinned = pins[info.userId];
  if (pinned !== undefined && pinned !== fingerprint) return { ok: false, reason: "changed" };
  if (pinned === fingerprint) return { ok: true, pin: null };
  if (info.role === "owner" || info.role === "admin") return { ok: true, pin: { userId: info.userId, fingerprint } };
  return { ok: false, reason: "not-admin" };
}

/** What to tell a person when a wrap is refused. */
export function distrustMessage(reason: "unknown" | "changed" | "not-admin"): string {
  if (reason === "changed") {
    return "A team key was signed by a key that does not match the one this account saw before for that person. Klef did not use it. Ask a team admin to compare fingerprints.";
  }
  if (reason === "not-admin") return "A team key was given out by someone who is not a team admin. Klef did not use it.";
  return "A team key was made by someone Klef cannot identify. Klef did not use it.";
}
