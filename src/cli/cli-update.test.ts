import { describe, expect, it } from "vitest";
import { cliUpdateLine } from "./cli-update.ts";

describe("the newer-klef notice", () => {
  it("says nothing when this klef is current, or the answer isn't a version", () => {
    expect(cliUpdateLine("0.11.8", "0.11.8", "klef")).toBeNull();
    expect(cliUpdateLine("0.11.8", "0.11.7", "klef")).toBeNull();
    expect(cliUpdateLine("0.11.8", null, "klef")).toBeNull();
    expect(cliUpdateLine("0.11.8", "not-a-version", "klef")).toBeNull();
  });

  it("names the newer version and how to get it, by how klef was run", () => {
    expect(cliUpdateLine("0.11.8", "0.12.0", "klef")).toBe(
      "klef 0.12.0 is out (you have 0.11.8); update with npm install -g @klefsh/cli.",
    );
    expect(cliUpdateLine("0.11.8", "0.12.0", "npx @klefsh/cli")).toBe(
      "klef 0.12.0 is out (you have 0.11.8); npx @klefsh/cli@latest runs it.",
    );
  });
});
