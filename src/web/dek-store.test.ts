// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDek, loadDek, saveDek, touchDek } from "./dek-store.ts";

// happy-dom here ships no IndexedDB. This stand-in covers the slice dek-store
// uses (open, one store, get/put/delete) with the same async callback shape,
// and keeps values by reference, which is what structured clone gives a
// CryptoKey in a real browser: the same usable, non-extractable key.
const records = new Map<string, unknown>();

function fakeRequest<T>(run: () => T) {
  const req: {
    result?: T;
    error: null;
    onsuccess?: () => void;
    onerror?: () => void;
    onupgradeneeded?: () => void;
  } = { error: null };
  setTimeout(() => {
    req.result = run();
    req.onupgradeneeded?.();
    req.onsuccess?.();
  });
  return req;
}

const fakeDb = {
  objectStoreNames: { contains: () => true },
  createObjectStore: () => undefined,
  close: () => undefined,
  transaction() {
    const tx: { oncomplete?: () => void; objectStore: () => unknown } = {
      objectStore: () => ({
        get: (key: string) => fakeRequest(() => records.get(key)),
        put: (value: unknown, key: string) =>
          fakeRequest(() => void records.set(key, value)),
        delete: (key: string) => fakeRequest(() => void records.delete(key)),
      }),
    };
    setTimeout(() => setTimeout(() => tx.oncomplete?.()));
    return tx;
  },
};

vi.stubGlobal("indexedDB", { open: () => fakeRequest(() => fakeDb) });

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

async function makeKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

beforeEach(() => {
  records.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("remembered vault key", () => {
  it("restores the same key for the same user within the window", async () => {
    const key = await makeKey();
    await saveDek("user-1", key);
    vi.setSystemTime(Date.now() + 3 * DAY_MS);
    expect(await loadDek("user-1", WEEK_MS)).toBe(key);
  });

  it("asks again once the window has passed, and evicts the stale key", async () => {
    await saveDek("user-1", await makeKey());
    vi.setSystemTime(Date.now() + 8 * DAY_MS);
    expect(await loadDek("user-1", WEEK_MS)).toBeNull();
    expect(records.size).toBe(0);
  });

  it("the default 15-minute window does not survive a lunch break", async () => {
    await saveDek("user-1", await makeKey());
    vi.setSystemTime(Date.now() + 60 * 60_000);
    expect(await loadDek("user-1", 15 * 60_000)).toBeNull();
  });

  it("use keeps the window open", async () => {
    const key = await makeKey();
    await saveDek("user-1", key);
    vi.setSystemTime(Date.now() + 6 * DAY_MS);
    await touchDek("user-1");
    vi.setSystemTime(Date.now() + 6 * DAY_MS);
    expect(await loadDek("user-1", WEEK_MS)).toBe(key);
  });

  it("never hands one account's key to another", async () => {
    await saveDek("user-1", await makeKey());
    expect(await loadDek("user-2", Infinity)).toBeNull();
    expect(records.size).toBe(0);
  });

  it("is gone after a lock", async () => {
    await saveDek("user-1", await makeKey());
    await clearDek();
    expect(await loadDek("user-1", Infinity)).toBeNull();
  });
});
