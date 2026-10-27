// Start /app's first requests as soon as the session is known, instead of
// one after another as each component mounts (vault key material, then the
// tree once VaultHome renders). The tree holds only names, which are
// plaintext by design, so fetching it before unlock leaks nothing new.
//
// Each prefetch is taken at most once, by the same user, while fresh; any
// later load (retry, reload after an edit) goes to the network as before.

import type { VaultTree } from "../shared/api-types.ts";
import { fetchVault, type VaultStatus } from "./vault-api.ts";
import { getTree } from "./structure-api.ts";

/** Older than this, a prefetch is dropped (e.g. the user sat on the unlock screen). */
export const PREFETCH_MAX_AGE_MS = 30_000;

type Entry<T> = { userId: string; at: number; promise: Promise<T> };

let vault: Entry<VaultStatus> | null = null;
let tree: Entry<VaultTree> | null = null;

function start<T>(userId: string, load: () => Promise<T>, at: number): Entry<T> {
  const promise = load();
  // Nobody may ever take it; don't let a failure surface as unhandled.
  promise.catch(() => {});
  return { userId, at, promise };
}

/** Kick off the vault and tree requests for `userId`. Safe to call on every render. */
export function prefetchAppData(userId: string, now = Date.now()): void {
  if (!vault || vault.userId !== userId || now - vault.at > PREFETCH_MAX_AGE_MS) {
    vault = start(userId, fetchVault, now);
  }
  if (!tree || tree.userId !== userId || now - tree.at > PREFETCH_MAX_AGE_MS) {
    tree = start(userId, getTree, now);
  }
}

function take<T>(entry: Entry<T> | null, userId: string | null, now: number) {
  if (!entry) return null;
  if (userId !== null && entry.userId !== userId) return null;
  if (now - entry.at > PREFETCH_MAX_AGE_MS) return null;
  return entry.promise;
}

/** The prefetched vault status for `userId`, once; null if none is usable. */
export function takePrefetchedVault(userId: string, now = Date.now()): Promise<VaultStatus> | null {
  const p = take(vault, userId, now);
  vault = null;
  return p;
}

/** The prefetched tree, once; null if none is usable. */
export function takePrefetchedTree(now = Date.now()): Promise<VaultTree> | null {
  const p = take(tree, null, now);
  tree = null;
  return p;
}

/** Test hook. */
export function resetPrefetch(): void {
  vault = null;
  tree = null;
}
