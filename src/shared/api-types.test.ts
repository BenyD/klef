import { describe, expect, it } from "vitest";
import { isPresetEnvironment, normalizeEnvironment } from "./api-types.ts";

describe("normalizeEnvironment", () => {
  it("passes tidy custom labels through", () => {
    expect(normalizeEnvironment("staging")).toBe("staging");
    expect(normalizeEnvironment("QA 2")).toBe("QA 2");
    expect(normalizeEnvironment("us-east.prod_2")).toBe("us-east.prod_2");
  });

  it("trims and collapses whitespace", () => {
    expect(normalizeEnvironment("  staging  ")).toBe("staging");
    expect(normalizeEnvironment("QA   2")).toBe("QA 2");
  });

  it("folds case-variants of presets onto the canonical form", () => {
    expect(normalizeEnvironment("Production")).toBe("production");
    expect(normalizeEnvironment("DEVELOPMENT")).toBe("development");
    expect(normalizeEnvironment("Staging")).toBe("Staging"); // not a preset
  });

  it("rejects empty, over-long, and untidy labels", () => {
    expect(normalizeEnvironment("")).toBeNull();
    expect(normalizeEnvironment("   ")).toBeNull();
    expect(normalizeEnvironment("x".repeat(33))).toBeNull();
    expect(normalizeEnvironment("qa!")).toBeNull();
    expect(normalizeEnvironment("st/aging")).toBeNull();
    expect(normalizeEnvironment("-qa")).toBeNull(); // must start with a word char
  });

  it("accepts labels exactly at the 32-char cap", () => {
    expect(normalizeEnvironment("x".repeat(32))).toBe("x".repeat(32));
  });
});

describe("isPresetEnvironment", () => {
  it("recognizes only the built-in labels", () => {
    expect(isPresetEnvironment("production")).toBe(true);
    expect(isPresetEnvironment("staging")).toBe(false);
    expect(isPresetEnvironment("Production")).toBe(false);
  });
});
