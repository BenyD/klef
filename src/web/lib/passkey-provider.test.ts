import { describe, expect, it } from "vitest";
import { passkeyProviderName } from "./passkey-provider.ts";

describe("passkeyProviderName", () => {
  it("names well-known authenticators", () => {
    expect(passkeyProviderName("bada5566-a7aa-401f-bd96-45619a55120d")).toBe(
      "iCloud Keychain",
    );
    expect(passkeyProviderName("EA9B8D66-4D01-1D21-3CE4-B6B48CB575D4")).toBe(
      "Google Password Manager",
    );
  });

  it("returns null for unknown or missing ids", () => {
    expect(passkeyProviderName("00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(passkeyProviderName(null)).toBeNull();
    expect(passkeyProviderName(undefined)).toBeNull();
  });
});
