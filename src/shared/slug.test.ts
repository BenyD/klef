import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS, slugify, workspaceSlug } from "./slug.ts";

describe("slugify", () => {
  it("lowercases and dashes word breaks", () => {
    expect(slugify("My Workspace")).toBe("my-workspace");
  });

  it("drops apostrophes instead of dashing them", () => {
    expect(slugify("Beny's Team")).toBe("benys-team");
    expect(slugify("Beny’s Team")).toBe("benys-team");
  });

  it("strips accents", () => {
    expect(slugify("Café Ünïcode")).toBe("cafe-unicode");
  });

  it("collapses symbol runs and trims edge dashes", () => {
    expect(slugify("  --Hello__World!!  ")).toBe("hello-world");
  });

  it("returns empty when nothing sluggable remains", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("日本語")).toBe("");
  });
});

describe("workspaceSlug", () => {
  it("uses the name's slug", () => {
    expect(workspaceSlug("My Team", "ws1")).toBe("my-team");
  });

  it("falls back to the id for unsluggable legacy names", () => {
    expect(workspaceSlug("!!!", "ws1")).toBe("ws1");
  });
});

it("reserves every current route", () => {
  for (const route of ["app", "auth", "api", "security", "terms", "privacy"]) {
    expect(RESERVED_SLUGS.has(route)).toBe(true);
  }
});
