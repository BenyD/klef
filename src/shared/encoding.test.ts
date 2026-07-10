import { describe, expect, it } from "vitest";
import {
  base64ToBytes,
  base64UrlToBytes,
  bytesToBase64,
  bytesToBase64Url,
  bytesToCrockford,
  bytesToUtf8,
  crockfordToBytes,
  utf8ToBytes,
} from "./encoding.ts";

describe("encoding", () => {
  it("round-trips base64 for random bytes", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(64));
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("round-trips utf-8 including multibyte and newlines", () => {
    const s = "DB_URL=postgres://u:p@h/db\n# café ☕\nKEY=\"multi\nline\"\n";
    expect(bytesToUtf8(utf8ToBytes(s))).toBe(s);
  });

  it("round-trips Crockford Base32 for 16 random bytes", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const text = bytesToCrockford(bytes);
    expect(crockfordToBytes(text, 16)).toEqual(bytes);
  });

  it("decodes Crockford tolerantly (case, dashes, look-alikes)", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const text = bytesToCrockford(bytes);
    const messy = `${text.slice(0, 5)}-${text.slice(5)}`.toLowerCase();
    expect(crockfordToBytes(messy, 16)).toEqual(bytes);
    // I/L map to 1, O maps to 0 — decoding must not throw on them.
    expect(() => crockfordToBytes("ILO10", 3)).not.toThrow();
  });

  it("throws on an invalid Crockford character", () => {
    expect(() => crockfordToBytes("@@@@", 2)).toThrow();
  });
});

describe("base64url", () => {
  it("round-trips random bytes", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(33));
    expect(base64UrlToBytes(bytesToBase64Url(bytes))).toEqual(bytes);
  });

  it("emits URL-safe output without padding", () => {
    // 0xfb 0xff produces + and / and padding in standard base64.
    const bytes = new Uint8Array([0xfb, 0xef, 0xff, 0xfe]);
    const url = bytesToBase64Url(bytes);
    expect(url).not.toMatch(/[+/=]/);
    expect(base64UrlToBytes(url)).toEqual(bytes);
  });

  it("accepts padded base64url input", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const url = bytesToBase64Url(bytes);
    const padded = url + "=".repeat((4 - (url.length % 4)) % 4);
    expect(padded).toContain("=");
    expect(base64UrlToBytes(padded)).toEqual(bytes);
  });
});
