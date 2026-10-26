// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

  // Dismissing plays the collapse animation first (happy-dom implements
  // element.animate), so these wait for the strip to unmount.
  it("renders the brand variant (mark icon, still dismissible)", async () => {
    render(
      <Banner variant="brand">
        <span>Klef has a new release</span>
      </Banner>,
    );
    expect(screen.getByText("Klef has a new release")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Dismiss"));
    await waitFor(() =>
      expect(screen.queryByText("Klef has a new release")).toBeNull(),
    );
  });

  it("hides on dismiss", async () => {
    render(<Banner>Heads up</Banner>);
    fireEvent.click(screen.getByLabelText("Dismiss"));
    await waitFor(() => expect(screen.queryByText("Heads up")).toBeNull());
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
