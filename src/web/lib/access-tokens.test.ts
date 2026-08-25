import { describe, expect, it } from "vitest";
import {
  describeExpiry,
  describeLastUsed,
  displayToken,
  EXPIRING_SOON_MS,
  EXPIRY_OPTIONS,
  DEFAULT_EXPIRY,
  tokenState,
} from "./access-tokens.ts";

const NOW = new Date("2026-08-25T12:00:00.000Z");
const inDays = (n: number) =>
  new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString();

describe("tokenState", () => {
  it("treats a null expiry as indefinitely active", () => {
    expect(tokenState({ expiresAt: null }, NOW)).toBe("active");
  });

  it("flags tokens inside the warning window", () => {
    expect(tokenState({ expiresAt: inDays(30) }, NOW)).toBe("active");
    expect(tokenState({ expiresAt: inDays(6) }, NOW)).toBe("expiring");
    expect(tokenState({ expiresAt: inDays(-1) }, NOW)).toBe("expired");
  });

  it("puts the warning boundary exactly at the window", () => {
    const edge = new Date(NOW.getTime() + EXPIRING_SOON_MS).toISOString();
    expect(tokenState({ expiresAt: edge }, NOW)).toBe("expiring");
  });

  it("fails closed on an unparseable expiry, matching the server", () => {
    expect(tokenState({ expiresAt: "soon-ish" }, NOW)).toBe("expired");
  });
});

describe("describeExpiry", () => {
  it("describes the common cases in plain language", () => {
    expect(describeExpiry({ expiresAt: null }, NOW)).toBe("Never expires");
    expect(describeExpiry({ expiresAt: inDays(5) }, NOW)).toBe("Expires in 5 days");
    expect(describeExpiry({ expiresAt: inDays(0.5) }, NOW)).toBe("Expires tomorrow");
    expect(describeExpiry({ expiresAt: inDays(-2) }, NOW)).toContain("Expired");
  });

  it("switches to an absolute date once a countdown stops helping", () => {
    const far = describeExpiry({ expiresAt: inDays(200) }, NOW);
    expect(far).toMatch(/^Expires \w/);
    expect(far).not.toContain("days");
  });
});

describe("describeLastUsed", () => {
  it("distinguishes never-used from used", () => {
    expect(describeLastUsed({ lastUsedAt: null }, NOW)).toBe("Never used");
    expect(describeLastUsed({ lastUsedAt: inDays(-2) }, NOW)).toBe(
      "Last used 2 days ago",
    );
  });

  it("degrades to never-used on a corrupt timestamp", () => {
    expect(describeLastUsed({ lastUsedAt: "???" }, NOW)).toBe("Never used");
  });
});

describe("displayToken", () => {
  it("renders the namespace plus the stored prefix, and nothing secret", () => {
    expect(displayToken("aB3xK9_p")).toBe("klef_pat_aB3xK9_p…");
  });
});

describe("EXPIRY_OPTIONS", () => {
  it("offers a no-expiry choice and a usable default", () => {
    expect(EXPIRY_OPTIONS.some((o) => o.days === null)).toBe(true);
    expect(EXPIRY_OPTIONS.some((o) => o.value === DEFAULT_EXPIRY)).toBe(true);
    expect(new Set(EXPIRY_OPTIONS.map((o) => o.value)).size).toBe(
      EXPIRY_OPTIONS.length,
    );
  });
});
