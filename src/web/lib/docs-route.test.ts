import { describe, expect, it } from "vitest";
import { shouldLoadDocs } from "./docs-route.ts";

describe("shouldLoadDocs", () => {
  it("hands over when the SPA routed to /docs client-side", () => {
    expect(shouldLoadDocs("https://klef.sh/", "https://klef.sh/docs")).toBe(true);
    expect(
      shouldLoadDocs("https://klef.sh/security", "https://klef.sh/docs/quickstart"),
    ).toBe(true);
  });

  it("stays put when /docs itself was loaded into the SPA", () => {
    expect(shouldLoadDocs("https://klef.sh/docs", "https://klef.sh/docs")).toBe(false);
    expect(shouldLoadDocs("http://localhost:5173/docs/", "http://localhost:5173/docs")).toBe(
      false,
    );
    expect(
      shouldLoadDocs("https://klef.sh/docs/faq?x=1", "https://klef.sh/docs/faq#top"),
    ).toBe(false);
  });

  it("hands over when the load URL is unknown", () => {
    expect(shouldLoadDocs(undefined, "https://klef.sh/docs")).toBe(true);
  });
});
