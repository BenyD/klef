import { describe, expect, it } from "vitest";
import { cleanEnvWhitespace, lintEnvText } from "./env-lint.ts";

describe("lintEnvText", () => {
  it("flags nothing for clean text", () => {
    const r = lintEnvText("A=1\nB=2\n");
    expect(r.hasIssues).toBe(false);
    expect(r.trailingSpaceLines).toEqual([]);
    expect(r.trailingBlankLines).toBe(0);
  });

  it("reports 1-based lines with trailing spaces or tabs", () => {
    const r = lintEnvText("A=1 \nB=2\nC=3\t\n");
    expect(r.trailingSpaceLines).toEqual([1, 3]);
    expect(r.hasIssues).toBe(true);
  });

  it("counts trailing blank lines beyond the final newline", () => {
    expect(lintEnvText("A=1\n").trailingBlankLines).toBe(0);
    expect(lintEnvText("A=1\n\n").trailingBlankLines).toBe(1);
    expect(lintEnvText("A=1\n\n  \n").trailingBlankLines).toBe(2);
  });

  it("does not count blank lines between content as trailing", () => {
    const r = lintEnvText("A=1\n\nB=2\n");
    expect(r.trailingBlankLines).toBe(0);
    expect(r.hasIssues).toBe(false);
  });
});

describe("cleanEnvWhitespace", () => {
  it("trims trailing spaces and drops trailing blank lines, keeping the newline", () => {
    expect(cleanEnvWhitespace("A=1 \nB=2\t\n\n\n")).toBe("A=1\nB=2\n");
  });

  it("preserves a no-final-newline file's style", () => {
    expect(cleanEnvWhitespace("A=1 \nB=2 ")).toBe("A=1\nB=2");
  });

  it("keeps blank lines that sit between content", () => {
    expect(cleanEnvWhitespace("A=1\n\nB=2\n")).toBe("A=1\n\nB=2\n");
  });

  it("leaves values and comments untouched", () => {
    const text = '# note\nA="a b c"\nB=  spaced-out\n';
    expect(cleanEnvWhitespace(text)).toBe(text);
  });
});
