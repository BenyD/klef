import { describe, expect, it } from "vitest";
import { pageHref } from "./urls";

describe("pageHref", () => {
  it("names the trailing-slash URL a docs page is served at", () => {
    expect(pageHref("/docs")).toBe("https://klef.sh/docs/");
    expect(pageHref("/docs/cli")).toBe("https://klef.sh/docs/cli/");
    expect(pageHref("/docs/guides/coding-agents")).toBe("https://klef.sh/docs/guides/coding-agents/");
  });

  it("does not double a slash that is already there", () => {
    expect(pageHref("/docs/cli/")).toBe("https://klef.sh/docs/cli/");
  });
});
