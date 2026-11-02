import { describe, expect, it } from "vitest";
import { trustSender } from "./team-trust.ts";

describe("trustSender", () => {
  it("trusts and pins a current admin seen for the first time", () => {
    expect(trustSender("fp1", { userId: "a", role: "admin" }, {})).toEqual({ ok: true, pin: { userId: "a", fingerprint: "fp1" } });
    expect(trustSender("fp1", { userId: "a", role: "owner" }, {})).toMatchObject({ ok: true });
  });

  it("keeps trusting a pinned key after its person has left", () => {
    expect(trustSender("fp1", { userId: "a", role: null }, { a: "fp1" })).toEqual({ ok: true, pin: null });
  });

  it("refuses a pinned person's changed key, a member who was never pinned, and an unknown sender", () => {
    expect(trustSender("fp2", { userId: "a", role: "admin" }, { a: "fp1" })).toEqual({ ok: false, reason: "changed" });
    expect(trustSender("fp3", { userId: "m", role: "member" }, {})).toEqual({ ok: false, reason: "not-admin" });
    expect(trustSender("fp3", { userId: "gone", role: null }, {})).toEqual({ ok: false, reason: "not-admin" });
    expect(trustSender("fp4", undefined, {})).toEqual({ ok: false, reason: "unknown" });
  });
});
