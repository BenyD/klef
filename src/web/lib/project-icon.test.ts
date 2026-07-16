import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveIconUrl, settleIcon } from "./project-icon.ts";

describe("resolveIconUrl", () => {
  it("derives a favicon URL from a site URL or bare domain", () => {
    expect(resolveIconUrl("https://dineeasy.app")).toBe(
      "https://dineeasy.app/favicon.ico",
    );
    expect(resolveIconUrl("dineeasy.app/pricing?x=1")).toBe(
      "https://dineeasy.app/favicon.ico",
    );
  });

  it("maps GitHub URLs to the owner avatar", () => {
    expect(resolveIconUrl("https://github.com/BenyD/klef")).toBe(
      "https://github.com/BenyD.png?size=64",
    );
    expect(resolveIconUrl("github.com/BenyD")).toBe(
      "https://github.com/BenyD.png?size=64",
    );
  });

  it("passes direct image URLs and data URLs through", () => {
    expect(resolveIconUrl("https://cdn.x.dev/logo.svg")).toBe(
      "https://cdn.x.dev/logo.svg",
    );
    expect(resolveIconUrl("data:image/png;base64,AAAA")).toBe(
      "data:image/png;base64,AAAA",
    );
  });

  it("upgrades http to https", () => {
    expect(resolveIconUrl("http://dineeasy.app")).toBe(
      "https://dineeasy.app/favicon.ico",
    );
  });

  it("rejects junk", () => {
    expect(resolveIconUrl("")).toBeNull();
    expect(resolveIconUrl("   ")).toBeNull();
    expect(resolveIconUrl("not a url at all")).toBeNull();
    expect(resolveIconUrl("localhost")).toBeNull();
    expect(resolveIconUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("settleIcon", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps an already-discovered icon without another lookup", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      settleIcon("https://x.dev/favicon.ico", "https://x.dev/icon.svg"),
    ).resolves.toBe("https://x.dev/icon.svg");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("passes non-guess icons through untouched", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(settleIcon("https://cdn.x.dev/logo.svg", null)).resolves.toBe(
      "https://cdn.x.dev/logo.svg",
    );
    await expect(settleIcon(null, null)).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("runs the lookup inline when a save beats the debounce", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ icon: "https://x.dev/icon.svg" })),
      ),
    );
    await expect(settleIcon("https://x.dev/favicon.ico", null)).resolves.toBe(
      "https://x.dev/icon.svg",
    );
  });

  it("falls back to the guess when the site declares no icon", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ icon: null }))),
    );
    await expect(settleIcon("https://x.dev/favicon.ico", null)).resolves.toBe(
      "https://x.dev/favicon.ico",
    );
  });
});
