import { describe, expect, it } from "vitest";
import { MAX_ASK_REASON, askAnswered, askLinkPath, cleanAskReason, parseAskLink } from "./ask-link.ts";

describe("the klef ask link", () => {
  it("round-trips a file, a name and a reason", () => {
    const path = askLinkPath({ fileId: "f-1", name: "STRIPE_SECRET_KEY", reason: "Stripe & co" });
    expect(path).toBe("/app?file=f-1&ask=STRIPE_SECRET_KEY&reason=Stripe+%26+co");
    expect(parseAskLink(new URL(path, "https://klef.sh").searchParams)).toEqual({
      fileId: "f-1",
      name: "STRIPE_SECRET_KEY",
      reason: "Stripe & co",
    });
  });

  it("leaves the reason out when there is none", () => {
    expect(askLinkPath({ fileId: "f", name: "A", reason: "  " })).toBe("/app?file=f&ask=A");
  });

  it("ignores a link without a file or with a name that isn't a variable name", () => {
    for (const q of ["ask=A", "file=f", "file=f&ask=1A", "file=f&ask=A%3DB", `file=f&ask=${"A".repeat(129)}`]) {
      expect(parseAskLink(new URLSearchParams(q)), q).toBeNull();
    }
  });
});

describe("the reason shown above the editor", () => {
  it("is one line with no control characters", () => {
    expect(cleanAskReason("Stripe\ntest\u001b[31m checkout\u2028now")).toBe("Stripe test [31m checkout now");
  });

  it("is capped, and missing when empty", () => {
    expect([...cleanAskReason("é".repeat(500))!]).toHaveLength(MAX_ASK_REASON);
    expect(cleanAskReason(" \n ")).toBeNull();
    expect(cleanAskReason(undefined)).toBeNull();
  });
});

describe("whether a file answers the ask", () => {
  it("needs the key's last assignment to have a value", () => {
    expect(askAnswered("A=1\nKEY=sk\n", "KEY")).toBe(true);
    expect(askAnswered("A=1\n", "KEY")).toBe(false);
    for (const empty of ["KEY=", "KEY=''", 'KEY=""', "KEY=   "]) {
      expect(askAnswered(`${empty}\n`, "KEY"), empty).toBe(false);
    }
    expect(askAnswered("KEY=sk\nKEY=\n", "KEY")).toBe(false);
    expect(askAnswered("# KEY=sk\n", "KEY")).toBe(false);
  });
});
