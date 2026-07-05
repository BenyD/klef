// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_LOCK_CHECK_INTERVAL_MS,
  AUTO_LOCK_DEFAULT_MINUTES,
  getAutoLockMinutes,
  setAutoLockMinutes,
  useAutoLock,
  useLockShortcut,
} from "./auto-lock.ts";

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

describe("auto-lock preference", () => {
  it("defaults to 15 minutes", () => {
    expect(getAutoLockMinutes()).toBe(AUTO_LOCK_DEFAULT_MINUTES);
  });

  it("round-trips a chosen value", () => {
    setAutoLockMinutes(30);
    expect(getAutoLockMinutes()).toBe(30);
    setAutoLockMinutes(0);
    expect(getAutoLockMinutes()).toBe(0);
  });

  it("falls back to the default on garbage storage values", () => {
    store.set("klef:auto-lock-minutes", "7");
    expect(getAutoLockMinutes()).toBe(AUTO_LOCK_DEFAULT_MINUTES);
    store.set("klef:auto-lock-minutes", "not-a-number");
    expect(getAutoLockMinutes()).toBe(AUTO_LOCK_DEFAULT_MINUTES);
  });
});

describe("useAutoLock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("locks after the configured idle period", () => {
    setAutoLockMinutes(5);
    const lock = vi.fn();
    renderHook(() => useAutoLock(lock));

    vi.advanceTimersByTime(4 * 60_000);
    expect(lock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60_000 + AUTO_LOCK_CHECK_INTERVAL_MS);
    expect(lock).toHaveBeenCalled();
  });

  it("activity resets the idle deadline", () => {
    setAutoLockMinutes(5);
    const lock = vi.fn();
    renderHook(() => useAutoLock(lock));

    vi.advanceTimersByTime(4 * 60_000);
    window.dispatchEvent(new Event("keydown"));
    vi.advanceTimersByTime(4 * 60_000);
    expect(lock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60_000 + AUTO_LOCK_CHECK_INTERVAL_MS);
    expect(lock).toHaveBeenCalled();
  });

  it("never locks when set to Never", () => {
    setAutoLockMinutes(0);
    const lock = vi.fn();
    renderHook(() => useAutoLock(lock));

    vi.advanceTimersByTime(24 * 60 * 60_000);
    expect(lock).not.toHaveBeenCalled();
  });

  it("stops checking after unmount", () => {
    setAutoLockMinutes(5);
    const lock = vi.fn();
    const { unmount } = renderHook(() => useAutoLock(lock));
    unmount();

    vi.advanceTimersByTime(60 * 60_000);
    expect(lock).not.toHaveBeenCalled();
  });
});

describe("useLockShortcut", () => {
  function press(init: KeyboardEventInit) {
    const event = new KeyboardEvent("keydown", { cancelable: true, ...init });
    window.dispatchEvent(event);
    return event;
  }

  it("locks on Cmd/Ctrl+Shift+L and consumes the event", () => {
    const lock = vi.fn();
    renderHook(() => useLockShortcut(lock));

    const meta = press({ key: "l", metaKey: true, shiftKey: true });
    expect(lock).toHaveBeenCalledTimes(1);
    expect(meta.defaultPrevented).toBe(true);

    press({ key: "L", ctrlKey: true, shiftKey: true });
    expect(lock).toHaveBeenCalledTimes(2);
  });

  it("ignores the key without the full chord", () => {
    const lock = vi.fn();
    renderHook(() => useLockShortcut(lock));

    press({ key: "l" });
    press({ key: "l", metaKey: true });
    press({ key: "l", shiftKey: true });
    expect(lock).not.toHaveBeenCalled();
  });

  it("detaches on unmount", () => {
    const lock = vi.fn();
    const { unmount } = renderHook(() => useLockShortcut(lock));
    unmount();

    press({ key: "l", metaKey: true, shiftKey: true });
    expect(lock).not.toHaveBeenCalled();
  });
});
