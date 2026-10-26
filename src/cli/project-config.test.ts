import { describe, expect, it } from "vitest";
import {
  allFiles,
  ConfigError,
  localPathFor,
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

describe("files", () => {
  const WITH_FILES = {
    ...VALID,
    file: ".env.local",
    files: [
      { file: ".env.local" },
      { file: ".env.production", path: ".env.production" },
      { file: "mobile.env.local", path: "apps/mobile/.env.local" },
    ],
  };

  it("is optional, and absent from a config that does not list any", () => {
    expect(parseProjectConfig(JSON.stringify(VALID))).not.toHaveProperty("files");
  });

  it("reads entries, defaulting each path to the vault name", () => {
    expect(parseProjectConfig(JSON.stringify(WITH_FILES)).files).toEqual([
      { file: ".env.local", path: ".env.local" },
      { file: ".env.production", path: ".env.production" },
      { file: "mobile.env.local", path: "apps/mobile/.env.local" },
    ]);
  });

  it("round-trips through serialize", () => {
    const config = parseProjectConfig(JSON.stringify(WITH_FILES));
    expect(parseProjectConfig(serializeProjectConfig(config))).toEqual(config);
  });

  it("rejects a non-array, an empty list, and non-object entries", () => {
    for (const files of [{}, "x", [], ["x"], [null], [[]]]) {
      const raw = JSON.stringify({ ...VALID, files });
      expect(() => parseProjectConfig(raw)).toThrow(ConfigError);
    }
  });

  it("names the entry with a missing or blank field", () => {
    const missing = JSON.stringify({ ...VALID, files: [{ file: ".env" }, { path: "x" }] });
    expect(() => parseProjectConfig(missing)).toThrow(/files\[1\]\.file/);
    const blank = JSON.stringify({ ...VALID, files: [{ file: ".env", path: " " }] });
    expect(() => parseProjectConfig(blank)).toThrow(/files\[0\]\.path/);
  });

  it("rejects the same vault file twice, ignoring case", () => {
    const raw = JSON.stringify({
      ...VALID,
      files: [{ file: ".env" }, { file: ".ENV", path: "other/.env" }],
    });
    expect(() => parseProjectConfig(raw)).toThrow(/twice/);
  });

  it("rejects two vault files written to one path", () => {
    const raw = JSON.stringify({
      ...VALID,
      files: [{ file: ".env.a", path: ".env" }, { file: ".env.b", path: ".env" }],
    });
    expect(() => parseProjectConfig(raw)).toThrow(/path ".env"/);
  });
});

describe("allFiles", () => {
  it("is the linked file alone when there is no list", () => {
    expect(allFiles(parseProjectConfig(JSON.stringify(VALID)))).toEqual([
      { file: ".env", path: ".env" },
    ]);
  });

  it("is the list when there is one", () => {
    const config = parseProjectConfig(
      JSON.stringify({ ...VALID, files: [{ file: "a.env", path: "apps/a/.env" }] }),
    );
    expect(allFiles(config)).toEqual([{ file: "a.env", path: "apps/a/.env" }]);
  });
});

describe("localPathFor", () => {
  const config = parseProjectConfig(
    JSON.stringify({ ...VALID, files: [{ file: "mobile.env.local", path: "apps/mobile/.env.local" }] }),
  );

  it("uses the files entry, matching names case-insensitively", () => {
    expect(localPathFor(config, "Mobile.env.local")).toBe("apps/mobile/.env.local");
  });

  it("is null for a file with no entry, leaving the default to the caller", () => {
    expect(localPathFor(config, ".env.production")).toBeNull();
    expect(localPathFor(parseProjectConfig(JSON.stringify(VALID)), ".env")).toBeNull();
  });
});
