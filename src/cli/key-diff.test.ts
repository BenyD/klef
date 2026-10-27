import { describe, expect, it } from "vitest";
import { formatKeyDiff, isEmptyDiff, keyDiff } from "./key-diff.ts";

const SECRET = "sk_live_do_not_print_me";

describe("keyDiff", () => {
  it("sorts keys into only-here, only-in-vault, and changed", () => {
    const local = `A=1\nB=${SECRET}\nNEW=x\n`;
    const vault = `A=1\nB=other\nOLD=y\n`;
    expect(keyDiff(local, vault)).toEqual({ onlyLocal: ["NEW"], onlyVault: ["OLD"], changed: ["B"], declaredLocal: [], declaredVault: [] });
  });

  it("is empty when only comments and order differ", () => {
    const diff = keyDiff("# a\nA=1\nB=2\n", "B=2\nA=1\n");
    expect(isEmptyDiff(diff)).toBe(true);
    expect(formatKeyDiff(diff, "# a\nA=1\nB=2\n", "B=2\nA=1\n")).toEqual([
      "  Same keys and values; only comments, order or spacing differ.",
    ]);
  });

  it("formats keys and never values", () => {
    const local = `API_KEY=${SECRET}\nNEW=1\n`;
    const vault = `API_KEY=${SECRET}_old\nGONE=2\n`;
    const lines = formatKeyDiff(keyDiff(local, vault), local, vault);
    expect(lines).toEqual([
      "  + NEW      only here",
      "  - GONE     only in the vault",
      "  ~ API_KEY  value differs",
    ]);
    expect(lines.join("\n")).not.toContain(SECRET);
  });

  it("says nothing for identical texts", () => {
    expect(formatKeyDiff(keyDiff("A=1\n", "A=1\n"), "A=1\n", "A=1\n")).toEqual([]);
  });
});

describe("commented-out keys", () => {
  it("are declared, unset: reported apart from set keys", () => {
    const local = "A=1\n# STRIPE_KEY=\n#export FLAG=on\n# just a comment\n";
    const vault = "A=1\nSTRIPE_KEY=sk\n# OLD=1\n";
    const diff = keyDiff(local, vault);
    expect(diff.declaredLocal).toEqual(["FLAG", "STRIPE_KEY"]);
    expect(diff.declaredVault).toEqual(["OLD"]);
    expect(formatKeyDiff(diff, local, vault)).toEqual([
      "  - STRIPE_KEY  only in the vault (declared, unset here)",
      "  # FLAG        declared, unset here",
      "  # OLD         declared, unset in the vault",
    ]);
  });

  it("does not count a commented line for a key that is also set", () => {
    expect(keyDiff("# A=old\nA=1\n", "A=1\n").declaredLocal).toEqual([]);
  });
});
