// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, sessionExpiry } from "./api-fetch.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("apiFetch", () => {
  it("passes ordinary responses through untouched", async () => {
    const ok = new Response("{}", { status: 200 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok));
    const redirect = vi.spyOn(sessionExpiry, "redirect").mockImplementation(() => {});

    await expect(apiFetch("/api/tree")).resolves.toBe(ok);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("does not treat other errors as session expiry", async () => {
    const server = new Response("{}", { status: 500 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(server));
    const redirect = vi.spyOn(sessionExpiry, "redirect").mockImplementation(() => {});

    await expect(apiFetch("/api/tree")).resolves.toBe(server);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to sign-in and throws on a 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
    );
    const redirect = vi.spyOn(sessionExpiry, "redirect").mockImplementation(() => {});

    await expect(apiFetch("/api/tree")).rejects.toThrow(
      "Your session expired. Sign in again to continue.",
    );
    expect(redirect).toHaveBeenCalledTimes(1);
  });
});
