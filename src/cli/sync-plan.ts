// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Which way each file should move. Pure: both copies and the last-synced
// record in, one decision out, so every case below is a unit test rather than
// a fixture of files and a fake server.
//
// The rule, in one line: the side that changed since the last sync wins, and
// if both did, or nothing says which did, a human decides. A change in the
// vault is pulled only over a local file nobody has touched since it last
// matched, so a pull here can never destroy an edit; a push never destroys
// anything, because vault versions are append-only.

import { isUnchanged } from "../shared/diff.ts";
import type { Baseline } from "./sync-state.ts";

export type SyncAction =
  /** Both copies match. */
  | "in-sync"
  /** Write the vault's copy here. */
  | "pull"
  /** Save the local copy as a new vault version. */
  | "push"
  /** The vault has no such file yet: create it, then push. */
  | "create"
  /** Both sides changed, or nothing says which did. Nothing is written. */
  | "conflict"
  /** Neither side has anything. */
  | "absent";

export interface SyncInput {
  /** The local file, or null when it does not exist. */
  local: { text: string; mtimeMs: number; size: number } | null;
  /** False when the project has no file of this name. */
  inVault: boolean;
  /** The vault's current version, or null when it has none yet. */
  vault: { text: string; versionId: string } | null;
  /** The last time this file matched the vault on this machine. */
  baseline: Baseline | null;
}

export interface SyncDecision {
  action: SyncAction;
  /** Why, in words fit to print after the file name. */
  reason: string;
}

export function decideSync(input: SyncInput): SyncDecision {
  const decision = decide(input);
  // An empty file is almost always a mistake rather than an intention, and
  // pushed it would become the current version of everything it held.
  if ((decision.action === "push" || decision.action === "create") && input.local?.text.trim() === "") {
    return { action: "conflict", reason: "is empty here; klef will not push an empty file" };
  }
  return decision;
}

function decide({ local, inVault, vault, baseline }: SyncInput): SyncDecision {
  if (!inVault) {
    return local
      ? { action: "create", reason: "not in the vault yet" }
      : { action: "absent", reason: "not here and not in the vault" };
  }
  if (!vault) {
    return local
      ? { action: "push", reason: "the vault has no saved version yet" }
      : { action: "absent", reason: "not here and no saved version in the vault" };
  }
  if (!local) return { action: "pull", reason: "missing here" };
  if (isUnchanged(vault.text, local.text)) return { action: "in-sync", reason: "in sync" };

  if (!baseline) {
    return { action: "conflict", reason: "differs from the vault and has never been synced on this machine" };
  }

  const editedHere = local.mtimeMs !== baseline.mtimeMs || local.size !== baseline.size;
  const changedThere = vault.versionId !== baseline.versionId;

  if (changedThere && !editedHere) return { action: "pull", reason: "changed in the vault" };
  if (editedHere && !changedThere) return { action: "push", reason: "edited here" };
  if (editedHere && changedThere) {
    return { action: "conflict", reason: "edited here and changed in the vault" };
  }
  // Neither side moved, yet they differ: the record is wrong about something.
  return { action: "conflict", reason: "differs from the vault for a reason klef cannot tell" };
}

/** A file's state from what can be seen without the passphrase, for `status`. */
export type QuickState =
  | "in-sync"
  | "edited-here"
  | "changed-in-vault"
  | "both-changed"
  | "missing-here"
  | "only-here"
  | "unknown"
  | "absent";

/**
 * What `status` can say about a file without decrypting anything: the local
 * file's mtime and size and the vault's current version id, against the last
 * time this machine synced it. "unknown" means never synced here, so only a
 * `diff` (which needs the passphrase) can say whether they match.
 */
export function quickState(input: {
  local: { mtimeMs: number; size: number } | null;
  vaultVersionId: string | null;
  baseline: Baseline | null;
}): QuickState {
  const { local, vaultVersionId, baseline } = input;
  if (!vaultVersionId) return local ? "only-here" : "absent";
  if (!local) return "missing-here";
  if (!baseline) return "unknown";
  const editedHere = local.mtimeMs !== baseline.mtimeMs || local.size !== baseline.size;
  const changedThere = vaultVersionId !== baseline.versionId;
  if (editedHere && changedThere) return "both-changed";
  if (editedHere) return "edited-here";
  if (changedThere) return "changed-in-vault";
  return "in-sync";
}

export const QUICK_STATE_WORDS: Record<QuickState, string> = {
  "in-sync": "in sync",
  "edited-here": "edited here",
  "changed-in-vault": "changed in the vault",
  "both-changed": "edited here and changed in the vault",
  "missing-here": "missing here",
  "only-here": "only here, not in the vault yet",
  unknown: "not synced on this machine yet",
  absent: "not here and not in the vault",
};
