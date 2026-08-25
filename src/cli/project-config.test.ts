import { describe, expect, it } from "vitest";
import {
  ConfigError,
  parseProjectConfig,
  serializeProjectConfig,
} from "./project-config.ts";

const VALID = {
  workspace: "personal",
  project: "klef",
  file: ".env",
  environment: "development",
};

describe("parseProjectConfig", () => {
  it("reads a complete config", () => {
    expect(parseProjectConfig(JSON.stringify(VALID))).toEqual(VALID);
  });

  it("treats a missing or blank environment as no label", () => {
    for (const environment of [undefined, null, "", "   "]) {
      const raw = JSON.stringify({ ...VALID, environment });
      expect(parseProjectConfig(raw).environment).toBeNull();
    }
  });

  it("trims surrounding whitespace from names", () => {
    const parsed = parseProjectConfig(
      JSON.stringify({ ...VALID, project: "  klef  " }),
    );
    expect(parsed.project).toBe("klef");
  });

  it("rejects malformed JSON with a useful message", () => {
    expect(() => parseProjectConfig("{nope")).toThrow(ConfigError);
    expect(() => parseProjectConfig("{nope")).toThrow(/not valid JSON/);
  });

  it("rejects a non-object document", () => {
    for (const raw of ["[]", '"string"', "null", "42"]) {
      expect(() => parseProjectConfig(raw)).toThrow(ConfigError);
    }
  });

  it("names the field that is missing", () => {
    const raw = JSON.stringify({ workspace: "personal", file: ".env" });
    expect(() => parseProjectConfig(raw)).toThrow(/"project"/);
  });

  it("rejects blank required names", () => {
    for (const field of ["workspace", "project", "file"]) {
      const raw = JSON.stringify({ ...VALID, [field]: "   " });
      expect(() => parseProjectConfig(raw)).toThrow(ConfigError);
    }
  });

  it("rejects a non-string environment", () => {
    expect(() => parseProjectConfig(JSON.stringify({ ...VALID, environment: 3 }))).toThrow(
      /"environment"/,
    );
  });
});

describe("serializeProjectConfig", () => {
  it("round-trips through parse", () => {
    const config = parseProjectConfig(JSON.stringify(VALID));
    expect(parseProjectConfig(serializeProjectConfig(config))).toEqual(config);
  });

  it("writes readable JSON ending in a newline", () => {
    const out = serializeProjectConfig(parseProjectConfig(JSON.stringify(VALID)));
    expect(out.endsWith("}\n")).toBe(true);
    expect(out).toContain("\n  ");
  });
});
