// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getConfirmSaveReview,
  setConfirmSaveReview,
} from "./preferences.ts";

// happy-dom here ships no localStorage; the app code tolerates that (falls
// back to the default), but these tests need a working store.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
});

beforeEach(() => {
  store.clear();
});

describe("confirm-save-review preference", () => {
  it("defaults to on", () => {
    expect(getConfirmSaveReview()).toBe(true);
  });

  it("persists off and back on", () => {
    setConfirmSaveReview(false);
    expect(getConfirmSaveReview()).toBe(false);
    setConfirmSaveReview(true);
    expect(getConfirmSaveReview()).toBe(true);
  });
});
