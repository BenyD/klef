import { describe, expect, it } from "vitest";
import {
  DEVICE_CODE_TTL_MS,
  generateDeviceCode,
  generateUserCode,
  isDeviceCodeShape,
  normalizeUserCode,
} from "./device-code.ts";

describe("device code", () => {
  it("mints unique, well-shaped secrets", () => {
    const codes = Array.from({ length: 100 }, generateDeviceCode);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(isDeviceCodeShape(c)).toBe(true);
  });

  it("rejects anything else", () => {
    for (const bad of ["", "short", "x".repeat(44), "has spaces in it here aaaaaaaaaaaaaaaaaaaa"]) {
      expect(isDeviceCodeShape(bad)).toBe(false);
    }
  });
});

describe("user code", () => {
  it("is grouped and readable", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateUserCode()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    }
  });

  // It is compared by eye against a browser, so the pairs people misread must
  // never appear: 0/O, 1/I/L, and U (misheard as V when read aloud).
  it("omits the characters people transcribe wrongly", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      for (const c of generateUserCode().replace("-", "")) seen.add(c);
    }
    for (const banned of ["I", "L", "O", "U", "0", "1"]) {
      expect(seen.has(banned), `${banned} should never appear`).toBe(false);
    }
  });

  it("accepts what a person actually types", () => {
    const code = generateUserCode();
    const bare = code.replace("-", "");
    expect(normalizeUserCode(code)).toBe(code);
    expect(normalizeUserCode(bare)).toBe(code);
    expect(normalizeUserCode(code.toLowerCase())).toBe(code);
    expect(normalizeUserCode(`  ${bare.toLowerCase()}  `)).toBe(code);
  });

  it("rejects codes that are the wrong length or use banned characters", () => {
    for (const bad of ["", "ABC-DEFG", "ABCD-EFGHI", "ABCD-EFGO", "ABCD-EF1H"]) {
      expect(normalizeUserCode(bad)).toBeNull();
    }
  });
});

describe("expiry", () => {
  it("is short, because it gates a live approval", () => {
    expect(DEVICE_CODE_TTL_MS).toBeLessThanOrEqual(15 * 60 * 1000);
  });
});
