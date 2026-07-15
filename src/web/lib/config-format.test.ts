import { describe, expect, it } from "vitest";
import { detectFormat, isDotenv } from "./config-format.ts";

describe("detectFormat by name", () => {
  it("recognizes dotenv shapes regardless of suffix", () => {
    for (const n of [
      ".env",
      "env",
      ".env.local",
      ".env.production",
      ".env.staging",
      "app/.env.local",
      "backend.env",
    ]) {
      expect(detectFormat(n)).toBe("dotenv");
    }
  });

  it("maps known extensions", () => {
    expect(detectFormat("config.json")).toBe("json");
    expect(detectFormat("tsconfig.jsonc")).toBe("json");
    expect(detectFormat("compose.yaml")).toBe("yaml");
    expect(detectFormat("app.yml")).toBe("yaml");
    expect(detectFormat("Cargo.toml")).toBe("toml");
  });

  it("does not mistake .env.production's tail for an extension", () => {
    expect(detectFormat(".env.production")).toBe("dotenv");
    expect(detectFormat(".env.json")).toBe("dotenv");
  });

  it("falls back to other for unknown names without content", () => {
    expect(detectFormat("credentials")).toBe("other");
    expect(detectFormat("secrets.txt")).toBe("other");
  });
});

describe("detectFormat by content", () => {
  it("detects json only when it actually parses", () => {
    expect(detectFormat("secrets", '{"a":1}')).toBe("json");
    expect(detectFormat("secrets", "{ not json }")).toBe("other");
  });

  it("distinguishes a toml section header from a json array", () => {
    expect(detectFormat("cfg", "[server]\nport = 8080")).toBe("toml");
    expect(detectFormat("cfg", "[1, 2, 3]")).toBe("json");
  });

  it("reads a dotenv block vs a yaml mapping", () => {
    expect(detectFormat("cfg", "# note\nAPI_KEY=abc\nPORT=3000")).toBe("dotenv");
    expect(detectFormat("cfg", "database:\n  host: localhost")).toBe("yaml");
    expect(detectFormat("cfg", "---\nname: klef")).toBe("yaml");
  });

  it("stays other when content is ambiguous or empty", () => {
    expect(detectFormat("cfg", "")).toBe("other");
    expect(detectFormat("cfg", "just some prose here")).toBe("other");
  });

  it("prefers a known name over content", () => {
    // A .env file that happens to hold a "key: value" line is still dotenv.
    expect(detectFormat(".env.local", "URL: http://x")).toBe("dotenv");
  });
});

describe("isDotenv", () => {
  it("narrows the format", () => {
    expect(isDotenv("dotenv")).toBe(true);
    expect(isDotenv("json")).toBe(false);
  });
});
