import { afterEach, describe, expect, it } from "vitest";
import {
  getRecentFileIds,
  recordRecentFile,
  sortByRecency,
} from "./recent-files.ts";

const FILES = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

describe("sortByRecency", () => {
  it("puts recent files first, most recent leading", () => {
    expect(sortByRecency(FILES, ["c", "a"]).map((f) => f.id)).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });

  it("keeps the given order when nothing is recent", () => {
    expect(sortByRecency(FILES, []).map((f) => f.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("ignores recency entries for unknown files", () => {
    expect(sortByRecency(FILES, ["zzz", "b"]).map((f) => f.id)).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
  });
});

describe("recordRecentFile", () => {
  // Node has no localStorage; stub the minimal surface (same approach as
  // auto-lock.test.ts under happy-dom).
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  function stubStorage() {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
  }

  it("records opens most-recent-first and dedupes", () => {
    stubStorage();
    recordRecentFile("a");
    recordRecentFile("b");
    recordRecentFile("a");
    expect(getRecentFileIds()).toEqual(["a", "b"]);
  });

  it("is a no-op without storage", () => {
    recordRecentFile("a");
    expect(getRecentFileIds()).toEqual([]);
  });
});
