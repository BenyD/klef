// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { AccessTokenSummary } from "../../shared/api-types.ts";

const api = vi.hoisted(() => ({
  listTokens: vi.fn(),
  createToken: vi.fn(),
  renameToken: vi.fn(),
  revokeToken: vi.fn(),
}));
vi.mock("../tokens-api.ts", () => api);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { AccessTokensPanel } = await import("./AccessTokensPanel.tsx");

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

function token(over: Partial<AccessTokenSummary>): AccessTokenSummary {
  return {
    id: crypto.randomUUID(),
    name: "token",
    prefix: "abcd1234",
    lastUsedAt: null,
    expiresAt: null,
    createdAt: ago(1),
    ...over,
  };
}

const LAPTOP = token({ id: "laptop", name: "macOS on mbp", lastUsedAt: ago(0), createdAt: ago(200) });
const OLD = token({ id: "old", name: "Linux on old-box", lastUsedAt: ago(120), createdAt: ago(300) });
const CI = token({ id: "ci", name: "CI deploy", lastUsedAt: ago(3), createdAt: ago(10), expiresAt: new Date(Date.now() + 40 * DAY).toISOString() });

beforeEach(() => {
  api.listTokens.mockResolvedValue([OLD, CI, LAPTOP]);
  api.revokeToken.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function rendered() {
  render(<AccessTokensPanel />);
  await screen.findByText("macOS on mbp");
}

/**
 * Open a row's menu and pick an item. The first menu of a run mounts Base
 * UI's popup machinery, which under a loaded full-suite run outlasted the
 * default 1s wait.
 */
async function choose(tokenName: string, item: string) {
  fireEvent.click(screen.getByRole("button", { name: `Actions for ${tokenName}` }));
  fireEvent.click(await screen.findByRole("menuitem", { name: item }, { timeout: 5000 }));
}

const rowNames = () =>
  screen
    .getAllByRole("button", { name: /^Actions for / })
    .map((b) => b.getAttribute("aria-label")!.replace("Actions for ", ""));

describe("AccessTokensPanel", () => {
  it("lists the most recently used first and flags the quiet ones", async () => {
    await rendered();
    expect(rowNames()).toEqual(["macOS on mbp", "CI deploy", "Linux on old-box"]);
    expect(screen.getAllByText("Unused")).toHaveLength(1);
    // A date is shown when there is one; "Never expires" is not repeated.
    expect(screen.getByText("Expires in 40 days")).toBeTruthy();
    expect(screen.queryByText("Never expires")).toBeNull();
    expect(screen.getByText(/revokes it\./)).toBeTruthy();
  });

  it("renames a token in place", async () => {
    api.renameToken.mockImplementation(async (id: string, name: string) => ({ ...LAPTOP, id, name }));
    await rendered();
    await choose("macOS on mbp", "Rename");

    const field = screen.getByLabelText<HTMLInputElement>("Token name");
    expect(field.value).toBe("macOS on mbp");
    fireEvent.change(field, { target: { value: "  Work laptop " } });
    fireEvent.submit(field.closest("form")!);

    expect(await screen.findByText("Work laptop")).toBeTruthy();
    expect(api.renameToken).toHaveBeenCalledWith("laptop", "Work laptop");
  });

  it("asks before revoking one token", async () => {
    await rendered();
    await choose("CI deploy", "Revoke");
    expect(api.revokeToken).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(screen.queryByText("CI deploy")).toBeNull());
    expect(api.revokeToken).toHaveBeenCalledWith("ci");
  });

  it("revokes only the unused ones, after naming them", async () => {
    await rendered();
    fireEvent.click(screen.getByRole("button", { name: "Revoke unused (1)" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Linux on old-box")).toBeTruthy();
    expect(within(dialog).queryByText("macOS on mbp")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke 1" }));
    await waitFor(() => expect(api.revokeToken).toHaveBeenCalledTimes(1));
    expect(api.revokeToken).toHaveBeenCalledWith("old");
  });

  it("offers no bulk action when nothing is unused", async () => {
    api.listTokens.mockResolvedValue([LAPTOP, CI]);
    await rendered();
    expect(screen.queryByRole("button", { name: /Revoke unused/ })).toBeNull();
  });
});
