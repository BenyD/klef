// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { renderToString } from "react-dom/server";
import { Pricing } from "./Pricing.tsx";

type Reply = { status: number; body?: unknown };

// A fake /api/reservation: records each call and answers from a queue.
function stubApi(replies: Reply[]) {
  const calls: { method: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const reply = replies.shift() ?? { status: 500 };
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const reservation = (plan: "pro" | "team") => ({
  reservation: { plan, createdAt: "2026-10-28T00:00:00.000Z", updatedAt: "2026-10-28T00:00:00.000Z" },
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/pricing"]}>
      <Pricing />
    </MemoryRouter>,
  );
}

beforeEach(() => cleanup());
afterEach(() => vi.unstubAllGlobals());

describe("Pricing", () => {
  it("prerenders without touching the browser, with sign-in links to reserve", () => {
    const html = renderToString(
      <MemoryRouter initialEntries={["/pricing"]}>
        <Pricing />
      </MemoryRouter>,
    );
    expect(html).toContain("Self-hosting is free forever.");
    expect(html).toContain("Reserve the founding price");
    expect(html).toContain("$24 a year, for life");
    expect(html).not.toMatch(/[–—]/);
  });

  it("shows all three plans with their prices", async () => {
    stubApi([{ status: 401 }]);
    renderPage();
    for (const name of ["Free", "Pro", "Team"]) {
      expect(screen.getByRole("heading", { name })).toBeTruthy();
    }
    expect(screen.getByText("or $36 a year, 3 months free")).toBeTruthy();
    expect(screen.getByText("or $108 a year, 3 months free")).toBeTruthy();
    expect(screen.getByText("Coming soon")).toBeTruthy();
  });

  it("sends a signed-out visitor to sign in instead of reserving", async () => {
    stubApi([{ status: 401 }]);
    renderPage();
    const link = await screen.findByRole("link", { name: "Reserve the founding price" });
    expect(link.getAttribute("href")).toBe("/auth");
    expect(screen.queryByRole("button", { name: /reserve/i })).toBeNull();
  });

  it("reserves Pro, then cancels, for a signed-in person", async () => {
    const calls = stubApi([
      { status: 200, body: { reservation: null } },
      { status: 200, body: reservation("pro") },
      { status: 200, body: { reservation: null } },
    ]);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Reserve the founding price" }));
    await screen.findByText("Reserved. Nothing is charged until paid plans open.");
    expect(calls[1]).toEqual({ method: "PUT", body: { plan: "pro" } });

    fireEvent.click(screen.getByRole("button", { name: "Cancel reservation" }));
    await screen.findByRole("button", { name: "Reserve the founding price" });
    expect(calls[2]?.method).toBe("DELETE");
  });

  it("offers to switch when the other plan is reserved", async () => {
    const calls = stubApi([
      { status: 200, body: reservation("pro") },
      { status: 200, body: reservation("team") },
    ]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Switch reservation to Team" }));
    await waitFor(() => expect(calls[1]).toEqual({ method: "PUT", body: { plan: "team" } }));
    await screen.findByRole("button", { name: "Switch reservation to Pro" });
  });

  it("says so when saving fails", async () => {
    stubApi([
      { status: 200, body: { reservation: null } },
      { status: 500, body: { error: "database unavailable" } },
    ]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Reserve a Team spot" }));
    const alerts = await screen.findAllByRole("alert");
    expect(alerts[0]?.textContent).toContain("database unavailable");
  });
});
