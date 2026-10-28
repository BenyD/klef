import { describe, expect, it } from "vitest";
import { effectiveEnvLabel, envLabel, envTag } from "./env-meta.ts";

describe("envLabel", () => {
  it("capitalizes presets", () => {
    expect(envLabel("production")).toBe("Production");
  });

  it("shows custom labels as typed", () => {
    expect(envLabel("staging")).toBe("staging");
  });
});

describe("envTag", () => {
  it("stays quiet when the name already says it", () => {
    expect(envTag(".env.production", "production")).toBeNull();
    expect(envTag(".env.production", null)).toBeNull();
  });

  it("labels a plain name given an environment", () => {
    expect(envTag(".env", "production")).toBe("Production");
  });
});

describe("effectiveEnvLabel", () => {
  it("falls back to the environment the name implies", () => {
    expect(effectiveEnvLabel(".env.production", null)).toBe("Production");
    expect(effectiveEnvLabel("secrets.env", null)).toBeNull();
  });
});
