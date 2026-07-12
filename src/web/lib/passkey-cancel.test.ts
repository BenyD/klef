import { describe, expect, it } from "vitest";
import { isPasskeyCancel } from "./passkey-cancel.ts";

describe("isPasskeyCancel", () => {
  it("treats every prompt-dismissal shape as a cancel", () => {
    // Explicit abort, NotAllowedError passthrough (dismissed/timed out
    // prompt), and Better Auth's own non-WebAuthn fallback.
    expect(isPasskeyCancel({ code: "ERROR_CEREMONY_ABORTED" })).toBe(true);
    expect(
      isPasskeyCancel({
        code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
        message: "Auth cancelled",
      }),
    ).toBe(true);
    expect(
      isPasskeyCancel({ code: "AUTH_CANCELLED", message: "Auth cancelled" }),
    ).toBe(true);
  });

  it("keeps real failures visible", () => {
    expect(isPasskeyCancel(null)).toBe(false);
    expect(isPasskeyCancel(undefined)).toBe(false);
    expect(isPasskeyCancel({ message: "Something broke" })).toBe(false);
    // Config errors arrive with a misleading "Auth cancelled" message but a
    // distinct code; they must still surface.
    expect(
      isPasskeyCancel({ code: "ERROR_INVALID_RP_ID", message: "Auth cancelled" }),
    ).toBe(false);
  });
});
