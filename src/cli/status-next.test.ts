import { describe, expect, it } from "vitest";
import { nextSteps } from "./commands/status.ts";
import type { FileState } from "./file-states.ts";

// What `klef status` tells an agent to run next. The order is the
// instruction: the skill says to follow it as given.

const base = { tokenStatus: "valid" as const, linked: false, unlocked: true, files: [] as FileState[], treeKnown: true, localEnvFiles: 1 };
const commands = (s: Parameters<typeof nextSteps>[0]) => nextSteps(s).map((n) => n.command.split(" ").slice(1).join(" "));

describe("status next steps", () => {
  it("suggests setup for an unlinked repo with env files, on an unlocked device", () => {
    expect(commands(base)).toEqual(["setup"]);
  });

  it("puts login before setup on a locked device, since setup stops before its pull", () => {
    expect(commands({ ...base, unlocked: false })).toEqual(["login", "setup"]);
  });

  it("offers no setup where there is no env file to link", () => {
    expect(commands({ ...base, localEnvFiles: 0 })).toEqual([]);
  });

  it("signs in through setup when there is no token, which also unlocks", () => {
    expect(commands({ ...base, tokenStatus: "absent", unlocked: false })).toEqual(["setup"]);
  });

  it("says to unlock a linked, locked device even when every file is in sync", () => {
    const files = [{ state: "in-sync" }] as unknown as FileState[];
    expect(commands({ ...base, linked: true, unlocked: false, files })).toEqual(["login"]);
    expect(commands({ ...base, linked: true, unlocked: true, files })).toEqual([]);
  });
});
