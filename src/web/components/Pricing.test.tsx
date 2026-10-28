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

const reservation = (plan: "hosted" | "kit") => ({
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
    expect(html).toContain("Pay once. Use it for good.");
    expect(html).toContain("Reserve at $29");
    expect(html).toContain("Reserve the kit");
    expect(html).toContain("Early price: $29.");
    expect(html).not.toMatch(/subscription per|a month/);
    expect(html).not.toMatch(/[–—]/);
  });

  it("shows two one-time plans and Team with no price", () => {
    stubApi([{ status: 401 }]);
    renderPage();
    for (const name of ["Hosted", "Self-host kit", "Team"]) {
      expect(screen.getByRole("heading", { name })).toBeTruthy();
    }
    expect(screen.getByText("$49")).toBeTruthy();
    expect(screen.getByText("$29")).toBeTruthy();
    expect(screen.getByText("No price yet")).toBeTruthy();
    expect(screen.getAllByText("once")).toHaveLength(2);
  });

  it("never offers a way to reserve Team", async () => {
    stubApi([{ status: 200, body: { reservation: null } }]);
    renderPage();
    await screen.findByRole("button", { name: "Reserve at $29" });
    expect(screen.queryByRole("button", { name: /team/i })).toBeNull();
    expect(screen.getByText("Planned. Nothing to reserve yet.")).toBeTruthy();
  });

  it("sends a signed-out visitor to sign in instead of reserving", async () => {
    stubApi([{ status: 401 }]);
    renderPage();
    const link = await screen.findByRole("link", { name: "Reserve at $29" });
    expect(link.getAttribute("href")).toBe("/auth");
    expect(screen.queryByRole("button", { name: /reserve/i })).toBeNull();
  });

  it("reserves Hosted, then cancels, for a signed-in person", async () => {
    const calls = stubApi([
      { status: 200, body: { reservation: null } },
      { status: 200, body: reservation("hosted") },
      { status: 200, body: { reservation: null } },
    ]);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Reserve at $29" }));
    await screen.findByText("Reserved. Nothing is charged until it opens.");
    expect(calls[1]).toEqual({ method: "PUT", body: { plan: "hosted" } });

    fireEvent.click(screen.getByRole("button", { name: "Cancel reservation" }));
    await screen.findByRole("button", { name: "Reserve at $29" });
    expect(calls[2]?.method).toBe("DELETE");
  });

  it("offers to switch when the other plan is reserved", async () => {
    const calls = stubApi([
      { status: 200, body: reservation("hosted") },
      { status: 200, body: reservation("kit") },
    ]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Switch to the self-host kit" }));
    await waitFor(() => expect(calls[1]).toEqual({ method: "PUT", body: { plan: "kit" } }));
    await screen.findByRole("button", { name: "Switch to Hosted" });
  });

  it("says so when saving fails", async () => {
    stubApi([
      { status: 200, body: { reservation: null } },
      { status: 500, body: { error: "database unavailable" } },
    ]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Reserve the kit" }));
    const alerts = await screen.findAllByRole("alert");
    expect(alerts[0]?.textContent).toContain("database unavailable");
  });
});
