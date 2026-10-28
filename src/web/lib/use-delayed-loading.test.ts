// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOADER_DELAY_MS,
  LOADER_MIN_MS,
  useDelayedLoading,
} from "./use-delayed-loading.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(active: boolean, opts?: { delayMs?: number; minMs?: number }) {
  return renderHook(({ on }) => useDelayedLoading(on, opts), {
    initialProps: { on: active },
  });
}

describe("useDelayedLoading", () => {
  it("shows nothing for a wait shorter than the delay", () => {
    const { result, rerender } = setup(true);
    act(() => vi.advanceTimersByTime(LOADER_DELAY_MS - 1));
    expect(result.current).toBe(false);
    rerender({ on: false });
    act(() => vi.advanceTimersByTime(LOADER_DELAY_MS * 2));
    expect(result.current).toBe(false);
  });

  it("shows once the wait outlasts the delay", () => {
    const { result } = setup(true);
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(LOADER_DELAY_MS));
    expect(result.current).toBe(true);
  });

  it("stays up for the minimum when the wait ends just after showing", () => {
    const { result, rerender } = setup(true);
    act(() => vi.advanceTimersByTime(LOADER_DELAY_MS));
    act(() => vi.advanceTimersByTime(50));
    rerender({ on: false });
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(LOADER_MIN_MS - 51));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
  });

  it("hides at once when it has already been up for the minimum", () => {
    const { result, rerender } = setup(true);
    act(() => vi.advanceTimersByTime(LOADER_DELAY_MS + LOADER_MIN_MS));
    rerender({ on: false });
    expect(result.current).toBe(false);
  });

  it("keeps showing without a blink when a new wait starts during the minimum", () => {
    const { result, rerender } = setup(true);
    act(() => vi.advanceTimersByTime(LOADER_DELAY_MS));
    rerender({ on: false });
    act(() => vi.advanceTimersByTime(100));
    rerender({ on: true });
    act(() => vi.advanceTimersByTime(LOADER_MIN_MS * 2));
    expect(result.current).toBe(true);
  });

  it("takes custom timings", () => {
    const { result, rerender } = setup(true, { delayMs: 0, minMs: 0 });
    act(() => vi.advanceTimersByTime(0));
    expect(result.current).toBe(true);
    rerender({ on: false });
    expect(result.current).toBe(false);
  });
});
