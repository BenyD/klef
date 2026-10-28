import { describe, expect, it } from "vitest";
import {
  describeCreated,
  isUnused,
  sortTokens,
  UNUSED_AFTER_MS,
  expiryLabel,
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

describe("expiryLabel", () => {
  // The trigger showed the raw stored value, so "90" and "never" reached the
  // user where "90 days" and "No expiry" belonged.
  it("resolves every offered value to its label", () => {
    for (const option of EXPIRY_OPTIONS) {
      expect(expiryLabel(option.value)).toBe(option.label);
    }
  });

  it("never shows a bare number or the word never", () => {
    for (const option of EXPIRY_OPTIONS) {
      expect(expiryLabel(option.value)).not.toMatch(/^\d+$/);
      expect(expiryLabel(option.value)).not.toBe("never");
    }
  });

  it("falls back to the value it was given when it knows no better", () => {
    expect(expiryLabel("nonsense")).toBe("nonsense");
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

describe("isUnused", () => {
  const token = (lastUsedAt: string | null, createdAt: string, expiresAt: string | null = null) => ({
    lastUsedAt,
    createdAt,
    expiresAt,
  });

  it("goes by last use, or creation for a token never used", () => {
    expect(isUnused(token(inDays(-1), inDays(-400)), NOW)).toBe(false);
    expect(isUnused(token(inDays(-91), inDays(-400)), NOW)).toBe(true);
    expect(isUnused(token(null, inDays(-10)), NOW)).toBe(false);
    expect(isUnused(token(null, inDays(-91)), NOW)).toBe(true);
  });

  it("puts the boundary exactly at the window", () => {
    const edge = new Date(NOW.getTime() - UNUSED_AFTER_MS).toISOString();
    expect(isUnused(token(edge, edge), NOW)).toBe(true);
  });

  it("always counts an expired token, however recently used", () => {
    expect(isUnused(token(inDays(-2), inDays(-30), inDays(-1)), NOW)).toBe(true);
  });
});

describe("sortTokens", () => {
  it("puts the most recently active first, and never-used ones by creation", () => {
    const sorted = sortTokens([
      { id: "old", lastUsedAt: inDays(-100), createdAt: inDays(-200) },
      { id: "fresh-unused", lastUsedAt: null, createdAt: inDays(-1) },
      { id: "busy", lastUsedAt: inDays(0), createdAt: inDays(-300) },
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["busy", "fresh-unused", "old"]);
  });
});

describe("describeCreated", () => {
  it("is relative for the recent past, a date after that", () => {
    expect(describeCreated({ createdAt: inDays(-2) }, NOW)).toBe("Created 2 days ago");
    expect(describeCreated({ createdAt: inDays(-30) }, NOW)).toMatch(/^Created [A-Z][a-z]{2} \d+$/);
    expect(describeLastUsed({ lastUsedAt: inDays(-30) }, NOW)).toMatch(/^Last used [A-Z][a-z]{2} \d+$/);
  });
});
