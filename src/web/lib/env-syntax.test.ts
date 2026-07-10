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

  it("peels trailing whitespace into its own token", () => {
    expect(types("KEY=value ")).toEqual(["key", "eq", "value", "trailing-space"]);
    expect(texts("KEY=value \t ")).toEqual(["KEY", "=", "value", " \t "]);
    // After a closing quote too; the space inside quotes stays in the string.
    expect(types('KEY="v" ')).toEqual(["key", "eq", "string", "trailing-space"]);
    expect(texts('KEY="v " ')).toEqual(["KEY", "=", '"v "', " "]);
  });

  it("flags trailing whitespace on comments, bare values, and blank-ish lines", () => {
    expect(types("# heading  ")).toEqual(["comment", "trailing-space"]);
    expect(types("KEY=  ")).toEqual(["key", "eq", "trailing-space"]);
    expect(types("   ")).toEqual(["trailing-space"]);
    expect(types("continuation line ")).toEqual(["text", "trailing-space"]);
  });

  it("does not flag interior or leading whitespace", () => {
    expect(types("KEY=has interior spaces")).toEqual(["key", "eq", "value"]);
    expect(types("  FOO=1")).toEqual(["text", "key", "eq", "value"]);
  });

  it("reassembles any line byte-for-byte", () => {
    for (const line of [
      "export  FOO = 'bar' # tail",
      "  # comment",
      "KEY=value=with=equals",
      "not an entry at all",
      "KEY=value ",
      "# heading\t",
      "    ",
    ]) {
      expect(texts(line).join("")).toBe(line);
    }
  });
});
