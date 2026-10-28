// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Save } from "lucide-react";
import { Button } from "./button.tsx";
import { LOADER_DELAY_MS } from "../../lib/use-delayed-loading.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const spinner = () => document.querySelector("[data-slot=spinner]");

describe("Button loading", () => {
  it("disables and marks busy at once, and spins only after the delay", () => {
    render(
      <Button loading>
        <Save />
        Save version
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save version" });
    expect(button).toHaveProperty("disabled", true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(spinner()).toBeNull();
    act(() => vi.advanceTimersByTime(LOADER_DELAY_MS));
    expect(spinner()).not.toBeNull();
  });

  it("never shows a spinner for a request faster than the delay", () => {
    const { rerender } = render(<Button loading>Save</Button>);
    act(() => vi.advanceTimersByTime(LOADER_DELAY_MS / 2));
    rerender(<Button loading={false}>Save</Button>);
    act(() => vi.advanceTimersByTime(LOADER_DELAY_MS * 4));
    expect(spinner()).toBeNull();
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveProperty("disabled", false);
    expect(button.getAttribute("aria-busy")).toBeNull();
  });

  it("keeps its own disabled state", () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole("button")).toHaveProperty("disabled", true);
  });
});
