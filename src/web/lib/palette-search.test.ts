import { describe, expect, it } from "vitest";
import {
  fuzzyMatch,
  highlightRuns,
  searchItems,
  tokenize,
  type Searchable,
} from "./palette-search.ts";

describe("fuzzyMatch", () => {
  it("returns null when the query is not a subsequence", () => {
    expect(fuzzyMatch(".env.local", "prod")).toBeNull();
    expect(fuzzyMatch("api", "apis")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(fuzzyMatch("STRIPE_KEY", "stripe")?.indices).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it("ranks exact over prefix over word start over mid-word", () => {
    const exact = fuzzyMatch("api", "api")!.score;
    const prefix = fuzzyMatch("api-gateway", "api")!.score;
    const wordStart = fuzzyMatch("public-api", "api")!.score;
    const midWord = fuzzyMatch("rapid", "api")!.score;
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(midWord);
  });

  it("ranks any contiguous match above a scattered one", () => {
    const contiguous = fuzzyMatch("reproduce", "prod")!.score;
    const scattered = fuzzyMatch(".env.production", "prdn")!.score;
    expect(contiguous).toBeGreaterThan(scattered);
  });

  it("lands scattered characters on word starts when it can", () => {
    // s(tripe) s(ecret) k(ey), not the first s/e/k it sees.
    expect(fuzzyMatch("STRIPE_SECRET_KEY", "ssk")?.indices).toEqual([
      0, 7, 14,
    ]);
  });

  it("matches the empty query with nothing highlighted", () => {
    expect(fuzzyMatch("anything", "")).toEqual({ score: 0, indices: [] });
  });
});

describe("tokenize", () => {
  it("splits on any whitespace and drops empties", () => {
    expect(tokenize("  lens   prod ")).toEqual(["lens", "prod"]);
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("searchItems", () => {
  const file = (id: string, name: string, project: string, env = "") => ({
    id,
    fields: [
      { text: name },
      { text: project, weight: 0.8 },
      { text: env, weight: 0.6 },
    ],
  });
  const items: Searchable[] = [
    file("web-local", ".env.local", "web", "Development"),
    file("web-prod", ".env.production", "web", "Production"),
    file("lens-local", ".env.local", "Lensdrop", "Development"),
    file("lens-prod", ".env.production", "Lensdrop", "Production"),
  ];

  it("needs every token to match some field", () => {
    const ids = searchItems(items, "lens prod").map((r) => r.item.id);
    expect(ids).toEqual(["lens-prod"]);
  });

  it("matches tokens across different fields and highlights each", () => {
    const [hit] = searchItems(items, "lens prod");
    expect(hit?.highlights[0]).toEqual([5, 6, 7, 8]); // "prod" in the name
    expect(hit?.highlights[1]).toEqual([0, 1, 2, 3]); // "lens" in the project
  });

  it("finds files by environment label", () => {
    const ids = searchItems(items, "development").map((r) => r.item.id);
    expect(ids).toEqual(["web-local", "lens-local"]);
  });

  it("returns everything, in input order, for an empty query", () => {
    expect(searchItems(items, "").map((r) => r.item.id)).toEqual(
      items.map((i) => i.id),
    );
  });

  it("puts a name match above a project match", () => {
    const named = { id: "named", fields: [{ text: "web" }] };
    const inProject = {
      id: "in-project",
      fields: [{ text: ".env" }, { text: "web", weight: 0.8 }],
    };
    const ids = searchItems([inProject, named], "web").map((r) => r.item.id);
    expect(ids).toEqual(["named", "in-project"]);
  });

  it("keeps input order for ties, so callers can pre-sort by recency", () => {
    const ids = searchItems(items, "local").map((r) => r.item.id);
    expect(ids).toEqual(["web-local", "lens-local"]);
  });
});

describe("highlightRuns", () => {
  it("groups consecutive matched and unmatched characters", () => {
    expect(highlightRuns("prod", [0, 1])).toEqual([
      { text: "pr", match: true },
      { text: "od", match: false },
    ]);
  });

  it("handles no matches and the empty string", () => {
    expect(highlightRuns("api", [])).toEqual([{ text: "api", match: false }]);
    expect(highlightRuns("", [])).toEqual([]);
  });
});
