import { describe, expect, it } from "vitest";
import { nextSteps } from "./commands/status.ts";

// What `klef status` tells an agent to run next. The order is the
// instruction: the skill says to follow it as given.

const base = { tokenStatus: "valid" as const, linked: false, unlocked: true, files: [], treeKnown: true };
const commands = (s: Parameters<typeof nextSteps>[0]) => nextSteps(s).map((n) => n.command.split(" ").at(-1));

describe("status next steps", () => {
  it("suggests setup for an unlinked repo on an unlocked device", () => {
    expect(commands(base)).toEqual(["setup"]);
  });

  it("puts login before setup on a locked device, since setup stops before its pull", () => {
    expect(commands({ ...base, unlocked: false })).toEqual(["login", "setup"]);
  });

  it("signs in through setup when there is no token, which also unlocks", () => {
    expect(commands({ ...base, tokenStatus: "absent", unlocked: false })).toEqual(["setup"]);
  });
});
