import { describe, expect, it } from "vitest";
import {
  generateToken,
  hashToken,
  isExpired,
  isTokenShape,
  LAST_USED_THROTTLE_MS,
  parseBearer,
  PREFIX_DISPLAY_LENGTH,
  shouldTouchLastUsed,
  tokenDisplayPrefix,
  TOKEN_PREFIX,
} from "./access-token.ts";

describe("token format", () => {
  it("mints namespaced, unique, well-formed tokens", () => {
    const minted = Array.from({ length: 100 }, generateToken);

    for (const token of minted) {
      expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
      expect(isTokenShape(token)).toBe(true);
    }
    expect(new Set(minted).size).toBe(minted.length);
  });

  it("rejects malformed tokens without touching the database", () => {
    const body = generateToken().slice(TOKEN_PREFIX.length);
    for (const bad of [
      "",
      body, // right shape, no namespace
      `klef_pat_${body.slice(0, -1)}`, // too short
      `${TOKEN_PREFIX}${body}x`, // too long
      `${TOKEN_PREFIX}${"!".repeat(43)}`, // outside base64url
      `${TOKEN_PREFIX}${body.slice(0, -1)}+`, // base64, not base64url
      "Bearer klef_pat_x",
    ]) {
      expect(isTokenShape(bad)).toBe(false);
    }
  });

  it("exposes a stable display prefix taken from the random body", () => {
    const token = generateToken();
    const prefix = tokenDisplayPrefix(token);

    expect(prefix).toHaveLength(PREFIX_DISPLAY_LENGTH);
    expect(token.startsWith(TOKEN_PREFIX + prefix)).toBe(true);
    // The namespace is constant, so a prefix taken from it would identify nothing.
    expect(prefix).not.toContain("klef");
  });
});

describe("hashToken", () => {
  it("is deterministic, and differs for different tokens", async () => {
    const a = generateToken();
    const b = generateToken();

    expect(await hashToken(a)).toBe(await hashToken(a));
    expect(await hashToken(a)).not.toBe(await hashToken(b));
  });

  it("never returns the token itself", async () => {
    const token = generateToken();
    const hash = await hashToken(token);

    expect(hash).not.toContain(token.slice(TOKEN_PREFIX.length));
    expect(hash).toHaveLength(44); // base64 of 32 bytes
  });
});

describe("parseBearer", () => {
  it("extracts any bearer credential, case-insensitively", () => {
    expect(parseBearer("Bearer klef_pat_abc")).toBe("klef_pat_abc");
    expect(parseBearer("bearer klef_pat_abc")).toBe("klef_pat_abc");
    expect(parseBearer("  Bearer   klef_pat_abc  ")).toBe("klef_pat_abc");
  });

  it("returns null when there is no bearer to parse", () => {
    for (const header of [undefined, null, "", "Basic abc", "Bearer", "Bearer  ", "klef_pat_abc"]) {
      expect(parseBearer(header)).toBeNull();
    }
  });

  it("returns foreign bearers rather than ignoring them", () => {
    // The middleware must be able to fail these loudly instead of silently
    // falling through to cookie auth.
    expect(parseBearer("Bearer github_pat_123")).toBe("github_pat_123");
  });
});

describe("isExpired", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");

  it("treats a null expiry as never expiring", () => {
    expect(isExpired(null, now)).toBe(false);
  });

  it("compares against the given instant", () => {
    expect(isExpired("2026-08-25T11:59:59.000Z", now)).toBe(true);
    expect(isExpired("2026-08-25T12:00:01.000Z", now)).toBe(false);
  });

  it("expires exactly at the boundary", () => {
    expect(isExpired("2026-08-25T12:00:00.000Z", now)).toBe(true);
  });

  it("fails closed on an unparseable timestamp", () => {
    expect(isExpired("not a date", now)).toBe(true);
  });
});

describe("shouldTouchLastUsed", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");

  it("always writes the first use", () => {
    expect(shouldTouchLastUsed(null, now)).toBe(true);
  });

  it("throttles writes within the window", () => {
    const recent = new Date(now.getTime() - LAST_USED_THROTTLE_MS + 1000);
    expect(shouldTouchLastUsed(recent.toISOString(), now)).toBe(false);
  });

  it("writes again once the window has passed", () => {
    const stale = new Date(now.getTime() - LAST_USED_THROTTLE_MS);
    expect(shouldTouchLastUsed(stale.toISOString(), now)).toBe(true);
  });

  it("writes rather than skipping on a corrupt timestamp", () => {
    expect(shouldTouchLastUsed("garbage", now)).toBe(true);
  });
});
