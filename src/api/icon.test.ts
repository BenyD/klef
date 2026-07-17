import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { icon, isSameSite, pickIconFromHtml } from "./icon.ts";

const BASE = new URL("https://lensdrop.app");

describe("icon discovery", () => {
  it("the real app requires a session", async () => {
    const res = await SELF.fetch("https://klef.test/api/icon?url=https://x.dev");
    expect(res.status).toBe(401);
  });

  it("picks the largest declared icon, resolving relative hrefs", async () => {
    // Shaped like lensdrop.app, which 404s on /favicon.ico.
    const html = `
      <link rel="icon" href="/assets/favicon-32x32.png" sizes="32x32" type="image/png"/>
      <link rel="icon" href="/assets/favicon-16x16.png" sizes="16x16" type="image/png"/>
      <link rel="icon" href="/assets/android-chrome-512x512.png" sizes="512x512" type="image/png"/>
      <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png"/>`;
    expect(pickIconFromHtml(html, BASE)).toBe(
      "https://lensdrop.app/assets/android-chrome-512x512.png",
    );
  });

  it("treats SVG icons as large even without a sizes attribute", () => {
    const html = `
      <link rel="icon" href="/small.png" sizes="32x32">
      <link rel="icon" href="/icon.svg" type="image/svg+xml">`;
    expect(pickIconFromHtml(html, BASE)).toBe("https://lensdrop.app/icon.svg");
  });

  it("prefers plain icons over apple-touch, but uses apple-touch alone", () => {
    const both = `
      <link rel="apple-touch-icon" href="/touch.png" sizes="180x180">
      <link rel="icon" href="/fav.png" sizes="48x48">`;
    expect(pickIconFromHtml(both, BASE)).toBe("https://lensdrop.app/fav.png");

    const touchOnly = `<link rel="apple-touch-icon" href="/touch.png">`;
    expect(pickIconFromHtml(touchOnly, BASE)).toBe(
      "https://lensdrop.app/touch.png",
    );
  });

  it("handles shortcut icon rels and absolute hrefs", () => {
    const html = `<link rel="shortcut icon" href="https://cdn.x.dev/f.ico">`;
    expect(pickIconFromHtml(html, BASE)).toBe("https://cdn.x.dev/f.ico");
  });

  it("ignores non-icon links, data hrefs, and iconless pages", () => {
    expect(
      pickIconFromHtml(`<link rel="stylesheet" href="/a.css">`, BASE),
    ).toBeNull();
    expect(
      pickIconFromHtml(`<link rel="icon" href="data:image/png;base64,AA">`, BASE),
    ).toBeNull();
    expect(pickIconFromHtml("<html><body>hi</body></html>", BASE)).toBeNull();
  });
});

describe("own-domain short-circuit", () => {
  // The Worker cannot fetch its own domain (Cloudflare blocks same-zone
  // subrequests), so /api/icon answers for the app's host without fetching.
  const ask = (requestHost: string, siteUrl: string) =>
    icon.request(`https://${requestHost}/?url=${encodeURIComponent(siteUrl)}`);

  it("returns the app's own declared icon without fetching", async () => {
    const res = await ask("klef.sh", "https://klef.sh");
    expect(await res.json()).toEqual({ icon: "https://klef.sh/favicon.svg" });
  });

  it("treats the www variant as the same site", async () => {
    const res = await ask("klef.sh", "https://www.klef.sh");
    expect(await res.json()).toEqual({ icon: "https://klef.sh/favicon.svg" });
  });

  it("compares hosts ignoring only a www prefix", () => {
    expect(isSameSite("klef.sh", "klef.sh")).toBe(true);
    expect(isSameSite("www.klef.sh", "klef.sh")).toBe(true);
    expect(isSameSite("notklef.sh", "klef.sh")).toBe(false);
    expect(isSameSite("sub.klef.sh", "klef.sh")).toBe(false);
  });
});

describe("fallback icon locations", () => {
  it("probes SVG first, favicon.ico last", async () => {
    const { FALLBACK_ICON_PATHS } = await import("./icon.ts");
    expect(FALLBACK_ICON_PATHS[0]).toBe("/favicon.svg");
    expect(FALLBACK_ICON_PATHS[FALLBACK_ICON_PATHS.length - 1]).toBe(
      "/favicon.ico",
    );
  });
});
