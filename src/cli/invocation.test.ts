import { describe, expect, it } from "vitest";
import { invocationName } from "./invocation.ts";

// `npx @klefsh/cli` leaves no `klef` on PATH, so a message saying "run
// `klef link`" sends the reader to command not found. Every suggestion the CLI
// prints has to match how it was actually reached.
describe("invocationName", () => {
  it("suggests npx when running out of the npx cache", () => {
    expect(
      invocationName("/Users/x/.npm/_npx/eb2e1daff901d727/node_modules/@klefsh/cli/index.js"),
    ).toBe("npx @klefsh/cli");
  });

  it("suggests the bare binary for a real install", () => {
    expect(invocationName("/usr/local/bin/klef")).toBe("klef");
    expect(invocationName("/Users/x/project/node_modules/.bin/klef")).toBe("klef");
  });

  it("falls back to the bare binary when argv is unavailable", () => {
    expect(invocationName(undefined)).toBe("klef");
  });
});
