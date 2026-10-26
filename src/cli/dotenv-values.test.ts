import { describe, expect, it } from "vitest";
import { decodeValue, encodeValue, envEntries, formatEnvText, parseVercelPull } from "./dotenv-values.ts";

describe("decodeValue", () => {
  it("reads values the way dotenv loaders do", () => {
    expect(decodeValue("plain")).toBe("plain");
    expect(decodeValue("plain # comment")).toBe("plain");
    expect(decodeValue("a#b")).toBe("a#b");
    expect(decodeValue('"a # b"')).toBe("a # b");
    expect(decodeValue('"line\\nbreak \\"q\\""')).toBe('line\nbreak "q"');
    expect(decodeValue("'lit\\n'")).toBe("lit\\n");
    expect(decodeValue('"x" # trailing')).toBe("x");
    expect(decodeValue("")).toBe("");
  });
});

describe("encodeValue", () => {
  it("round-trips through decodeValue", () => {
    for (const value of ["", "simple", "a b", "it's", 'say "hi"', "two\nlines", "back\\slash", "#hash", "$HOME"]) {
      expect(decodeValue(encodeValue(value))).toBe(value);
    }
  });

  it("leaves simple values bare", () => {
    expect(encodeValue("https://x.dev/a?b=1")).toBe("https://x.dev/a?b=1");
  });
});

describe("envEntries and formatEnvText", () => {
  it("decodes in first-seen order, last assignment winning", () => {
    expect([...envEntries("# c\nA=1\nB='2'\nA=3\n")]).toEqual([["A", "3"], ["B", "2"]]);
  });

  it("writes a well-formed file that parses back to the same entries", () => {
    const entries: [string, string][] = [["Z", "last but first"], ["A", "x\ny"]];
    expect([...envEntries(formatEnvText(entries))]).toEqual(entries);
  });
});

describe("parseVercelPull", () => {
  it("reads Vercel's quoting, which escapes line breaks only", () => {
    const text = '# Created by Vercel CLI\nA="one"\nB="say "hi""\nC="l1\\nl2"\nD="back\\slash"\nE=""\n';
    expect(Object.fromEntries(parseVercelPull(text))).toEqual({
      A: "one",
      B: 'say "hi"',
      C: "l1\nl2",
      D: "back\\slash",
      E: "",
    });
  });
});
