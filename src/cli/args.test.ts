import { describe, expect, it } from "vitest";
import { flagValue, hasFlag, parseArgs } from "./args.ts";

describe("parseArgs", () => {
  it("reads a bare command", () => {
    const args = parseArgs(["status"]);
    expect(args.command).toBe("status");
    expect(args.positionals).toEqual([]);
    expect(args.flags.size).toBe(0);
  });

  it("returns a null command when given nothing", () => {
    expect(parseArgs([]).command).toBeNull();
  });

  it("treats value flags as taking the next argument", () => {
    const args = parseArgs(["pull", "--file", ".env.local"]);
    expect(args.command).toBe("pull");
    expect(flagValue(args, "file")).toBe(".env.local");
    expect(args.positionals).toEqual([]);
  });

  it("accepts --flag=value form", () => {
    expect(flagValue(parseArgs(["pull", "--file=.env"]), "file")).toBe(".env");
  });

  it("keeps unknown flags boolean rather than eating the next argument", () => {
    const args = parseArgs(["pull", "--force", "extra"]);
    expect(args.flags.get("force")).toBe(true);
    expect(args.positionals).toEqual(["extra"]);
  });

  it("does not consume a following flag as a value", () => {
    const args = parseArgs(["pull", "--file", "--force"]);
    expect(args.flags.get("file")).toBe(true);
    expect(args.flags.get("force")).toBe(true);
  });

  it("collects positionals after the command", () => {
    const args = parseArgs(["link", "personal", "klef"]);
    expect(args.command).toBe("link");
    expect(args.positionals).toEqual(["personal", "klef"]);
  });

  it("passes everything after -- through as positionals", () => {
    const args = parseArgs(["run", "--", "--not-a-flag", "x"]);
    expect(args.positionals).toEqual(["--not-a-flag", "x"]);
    expect(args.flags.has("not-a-flag")).toBe(false);
  });

  it("reads short flags as booleans", () => {
    expect(hasFlag(parseArgs(["-h"]), "h", "help")).toBe(true);
    expect(hasFlag(parseArgs(["--help"]), "h", "help")).toBe(true);
    expect(hasFlag(parseArgs(["status"]), "h", "help")).toBe(false);
  });

  it("ignores a boolean flag when a string was wanted", () => {
    expect(flagValue(parseArgs(["pull", "--file"]), "file")).toBeNull();
  });
});
