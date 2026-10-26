// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Banner } from "./Banner.tsx";

// happy-dom here ships no localStorage; the component tolerates that, but
// the persistence tests need a working store.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
});

afterEach(() => {
  cleanup();
  store.clear();
});

describe("Banner (announcement strip)", () => {
  it("renders its message", () => {
    render(<Banner variant="warning">Klef has a new release</Banner>);
    expect(screen.getByText("Klef has a new release")).toBeTruthy();
  });

  it("renders the brand variant (mark icon, still dismissible)", () => {
    render(
      <Banner variant="brand">
        <span>Klef has a new release</span>
      </Banner>,
    );
    expect(screen.getByText("Klef has a new release")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText("Klef has a new release")).toBeNull();
  });

  it("hides on dismiss", () => {
    render(<Banner>Heads up</Banner>);
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText("Heads up")).toBeNull();
  });

  it("does not persist dismissal without an id", () => {
    render(<Banner>Heads up</Banner>);
    fireEvent.click(screen.getByLabelText("Dismiss"));
    cleanup();
    render(<Banner>Heads up</Banner>);
    expect(screen.getByText("Heads up")).toBeTruthy();
  });

  it("persists dismissal by id across mounts", () => {
    render(<Banner id="release-notice">Heads up</Banner>);
    fireEvent.click(screen.getByLabelText("Dismiss"));
    cleanup();
    render(<Banner id="release-notice">Heads up</Banner>);
    expect(screen.queryByText("Heads up")).toBeNull();
  });
});
