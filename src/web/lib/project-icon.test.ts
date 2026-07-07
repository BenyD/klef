import { describe, expect, it } from "vitest";
import { resolveIconUrl } from "./project-icon.ts";

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
