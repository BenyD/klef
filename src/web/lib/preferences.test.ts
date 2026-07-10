// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getConfirmLoadVersion,
  getConfirmSaveReview,
  getEnvLabelOverrides,
  setConfirmLoadVersion,
  setConfirmSaveReview,
  setEnvLabelOverride,
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

describe("confirm-load-version preference", () => {
  it("defaults to on", () => {
    expect(getConfirmLoadVersion()).toBe(true);
  });

  it("persists off and back on", () => {
    setConfirmLoadVersion(false);
    expect(getConfirmLoadVersion()).toBe(false);
    setConfirmLoadVersion(true);
    expect(getConfirmLoadVersion()).toBe(true);
  });
});

describe("environment label overrides", () => {
  it("starts empty and stores renames", () => {
    expect(getEnvLabelOverrides()).toEqual({});
    setEnvLabelOverride("preview", "Staging");
    expect(getEnvLabelOverrides()).toEqual({ preview: "Staging" });
  });

  it("clears with null, an empty label, or the default name", () => {
    setEnvLabelOverride("preview", "Staging");
    setEnvLabelOverride("preview", null);
    expect(getEnvLabelOverrides()).toEqual({});

    setEnvLabelOverride("production", "Prod");
    setEnvLabelOverride("production", "   ");
    expect(getEnvLabelOverrides()).toEqual({});

    // Typing the canonical name back restores the default.
    setEnvLabelOverride("development", "Development");
    expect(getEnvLabelOverrides()).toEqual({});
  });

  it("normalizes labels like custom environments", () => {
    setEnvLabelOverride("development", "  Dev   box ");
    expect(getEnvLabelOverrides()).toEqual({ development: "Dev box" });
    // Invalid labels leave the default in place.
    setEnvLabelOverride("preview", "st@ging!");
    expect(getEnvLabelOverrides()).toEqual({ development: "Dev box" });
  });

  it("ignores junk in storage", () => {
    localStorage.setItem("klef:env-labels", "not json");
    expect(getEnvLabelOverrides()).toEqual({});
    localStorage.setItem("klef:env-labels", '{"bogus":"X","preview":3}');
    expect(getEnvLabelOverrides()).toEqual({});
  });
});
