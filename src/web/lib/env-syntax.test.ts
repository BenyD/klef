import { describe, expect, it } from "vitest";
import { tokenizeEnvLine } from "./env-syntax.ts";

const types = (line: string) => tokenizeEnvLine(line).map((t) => t.type);
const texts = (line: string) => tokenizeEnvLine(line).map((t) => t.text);

describe("tokenizeEnvLine", () => {
  it("splits entries into key, separator, and value", () => {
    expect(types("API_KEY=abc123")).toEqual(["key", "eq", "value"]);
    expect(texts("API_KEY = abc123")).toEqual(["API_KEY", " = ", "abc123"]);
  });

  it("marks quoted values as strings", () => {
    expect(types('GREETING="hello world"')).toEqual(["key", "eq", "string"]);
    expect(types("GREETING='hi'")).toEqual(["key", "eq", "string"]);
  });

  it("handles export prefixes and indentation", () => {
    expect(types("export NODE_ENV=production")).toEqual([
      "export",
      "key",
      "eq",
      "value",
    ]);
    expect(types("  FOO=1")).toEqual(["text", "key", "eq", "value"]);
  });

  it("keeps comments and reassembles them losslessly", () => {
    expect(types("# database")).toEqual(["comment"]);
    expect(types("  # indented")).toEqual(["text", "comment"]);
    expect(texts("# a=b").join("")).toBe("# a=b");
  });

  it("treats empty keys/values and junk lines gracefully", () => {
    expect(types("KEY=")).toEqual(["key", "eq"]);
    expect(types("continuation of a quoted value")).toEqual(["text"]);
    expect(tokenizeEnvLine("")).toEqual([]);
  });

  it("reassembles any line byte-for-byte", () => {
    for (const line of [
      "export  FOO = 'bar' # tail",
      "  # comment",
      "KEY=value=with=equals",
      "not an entry at all",
    ]) {
      expect(texts(line).join("")).toBe(line);
    }
  });
});
