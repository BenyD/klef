import { describe, expect, it } from "vitest";
import {
  effectiveEnvironment,
  environmentFromName,
  environmentWorthShowing,
} from "./env-from-name.ts";

describe("environmentFromName", () => {
  it.each([
    [".env.local", "development"],
    [".env.development", "development"],
    [".env.development.local", "development"],
    [".dev.vars", "development"],
    [".env.production", "production"],
    [".env.production.local", "production"],
    [".prod.vars", "production"],
    [".env.preview", "preview"],
    [".env.staging", "staging"],
  ])("reads %s as %s", (name, env) => {
    expect(environmentFromName(name)).toBe(env);
  });

  it("does not read .env.production.local as plain .env.local", () => {
    expect(environmentFromName(".env.production.local")).toBe("production");
  });

  it("reads prefixed vault names and paths by their ending", () => {
    expect(environmentFromName("mobile.env.local")).toBe("development");
    expect(environmentFromName("apps/web/.env.production")).toBe("production");
    expect(environmentFromName("worker\\.dev.vars")).toBe("development");
  });

  it("ignores case and surrounding space", () => {
    expect(environmentFromName(" .ENV.Production ")).toBe("production");
  });

  it("implies nothing for names that don't say", () => {
    for (const name of [".env", ".env.example", ".env.test", "secrets.env", "config.json", ""]) {
      expect(environmentFromName(name), name).toBeNull();
    }
  });
});

describe("effectiveEnvironment", () => {
  it("prefers the explicitly set environment", () => {
    expect(effectiveEnvironment(".env.local", "staging")).toBe("staging");
    expect(effectiveEnvironment(".env", "production")).toBe("production");
  });

  it("falls back to the name, then to nothing", () => {
    expect(effectiveEnvironment(".env.production", null)).toBe("production");
    expect(effectiveEnvironment(".env.local", "  ")).toBe("development");
    expect(effectiveEnvironment(".env", undefined)).toBeNull();
  });
});

describe("environmentWorthShowing", () => {
  it("hides a label the name already says", () => {
    expect(environmentWorthShowing(".env.production", "production")).toBeNull();
    expect(environmentWorthShowing(".env.local", "Development")).toBeNull();
  });

  it("hides files with nothing set", () => {
    expect(environmentWorthShowing(".env.production", null)).toBeNull();
    expect(environmentWorthShowing(".env", null)).toBeNull();
  });

  it("shows an environment set on a name that implies none", () => {
    expect(environmentWorthShowing(".env", "production")).toBe("production");
    expect(environmentWorthShowing("secrets.env", "qa")).toBe("qa");
  });

  it("shows an environment that contradicts the name", () => {
    expect(environmentWorthShowing(".env.local", "production")).toBe("production");
  });
});
