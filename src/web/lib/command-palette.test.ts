// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLockShortcut } from "./auto-lock.ts";
import { paletteFilter, usePaletteShortcut } from "./command-palette.ts";

describe("paletteFilter", () => {
  it("matches everything on an empty query", () => {
    expect(paletteFilter(".env.local", "")).toBe(1);
    expect(paletteFilter(".env.local", "   ")).toBe(1);
  });

  it("ranks prefix over substring over keyword matches", () => {
    const prefix = paletteFilter("api/.env", "api");
    const substring = paletteFilter("web/.env.api", "api");
    const keyword = paletteFilter(".env.local", "api", ["api"]);
    expect(prefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(keyword);
    expect(keyword).toBeGreaterThan(0);
  });

  it("returns 0 when nothing matches", () => {
    expect(paletteFilter(".env.local", "xyz")).toBe(0);
    expect(paletteFilter(".env.local", "xyz", ["production"])).toBe(0);
  });

  it("is case-insensitive on both sides", () => {
    expect(paletteFilter("API/.env", "api")).toBeGreaterThan(0);
    expect(paletteFilter("api/.env", "API")).toBeGreaterThan(0);
    expect(paletteFilter(".env", "PROD", ["Production"])).toBeGreaterThan(0);
  });

  it("requires every token to match somewhere", () => {
    // "api prod" narrows to the api project's production file...
    expect(
      paletteFilter("api/.env.production", "api prod"),
    ).toBeGreaterThan(0);
    // ...matching across value and keywords.
    expect(paletteFilter("api/.env", "api prod", ["production"])).toBeGreaterThan(
      0,
    );
    // One missing token kills the match even if the other hits.
    expect(paletteFilter("api/.env.production", "api xyz")).toBe(0);
  });

  it("matches environment keywords on files named without them", () => {
    expect(paletteFilter("web/.env.local", "development", ["development"]))
      .toBeGreaterThan(0);
  });
});

describe("usePaletteShortcut", () => {
  function press(init: KeyboardEventInit) {
    const event = new KeyboardEvent("keydown", { cancelable: true, ...init });
    window.dispatchEvent(event);
    return event;
  }

  it("toggles on Cmd/Ctrl+K and consumes the event", () => {
    const toggle = vi.fn();
    renderHook(() => usePaletteShortcut(toggle));

    const meta = press({ key: "k", metaKey: true });
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(meta.defaultPrevented).toBe(true);

    press({ key: "K", ctrlKey: true });
    expect(toggle).toHaveBeenCalledTimes(2);
  });

  it("ignores bare keys and Shift/Alt chords", () => {
    const toggle = vi.fn();
    renderHook(() => usePaletteShortcut(toggle));

    press({ key: "k" });
    press({ key: "k", metaKey: true, shiftKey: true });
    press({ key: "k", metaKey: true, altKey: true });
    expect(toggle).not.toHaveBeenCalled();
  });

  it("coexists with the lock shortcut without cross-firing", () => {
    const toggle = vi.fn();
    const lock = vi.fn();
    renderHook(() => {
      usePaletteShortcut(toggle);
      useLockShortcut(lock);
    });

    press({ key: "l", metaKey: true, shiftKey: true });
    expect(lock).toHaveBeenCalledTimes(1);
    expect(toggle).not.toHaveBeenCalled();

    press({ key: "k", metaKey: true });
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("detaches on unmount", () => {
    const toggle = vi.fn();
    const { unmount } = renderHook(() => usePaletteShortcut(toggle));
    unmount();

    press({ key: "k", metaKey: true });
    expect(toggle).not.toHaveBeenCalled();
  });
});
