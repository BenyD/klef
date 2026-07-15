import { describe, expect, it } from "vitest";
import { cleanEnvWhitespace, lintEnvText } from "./env-lint.ts";

describe("lintEnvText", () => {
  it("flags nothing for clean text", () => {
    const r = lintEnvText("A=1\nB=2\n");
    expect(r.hasIssues).toBe(false);
    expect(r.trailingSpaceLines).toEqual([]);
  });

  it("reports 1-based lines with trailing spaces or tabs", () => {
    const r = lintEnvText("A=1 \nB=2\nC=3\t\n");
    expect(r.trailingSpaceLines).toEqual([1, 3]);
    expect(r.hasIssues).toBe(true);
  });

  it("does not warn about trailing blank lines or the final newline", () => {
    // A single final newline is good; extra blank lines are harmless.
    expect(lintEnvText("A=1\n").hasIssues).toBe(false);
    expect(lintEnvText("A=1\n\n").hasIssues).toBe(false);
    expect(lintEnvText("A=1\n\n  \n").hasIssues).toBe(false);
  });

  it("does not flag a blank line's own whitespace as a value footgun", () => {
    expect(lintEnvText("A=1\n   \nB=2\n").trailingSpaceLines).toEqual([]);
  });
});

describe("cleanEnvWhitespace", () => {
  it("trims trailing spaces and tabs from content lines", () => {
    expect(cleanEnvWhitespace("A=1 \nB=2\t\n")).toBe("A=1\nB=2\n");
  });

  it("keeps blank lines and the final-newline style", () => {
    // Blank lines are preserved; only the invisible trailing space goes.
    expect(cleanEnvWhitespace("A=1 \n\nB=2\n")).toBe("A=1\n\nB=2\n");
    expect(cleanEnvWhitespace("A=1 \nB=2 ")).toBe("A=1\nB=2");
    expect(cleanEnvWhitespace("A=1\n\n\n")).toBe("A=1\n\n\n");
  });

  it("leaves values and comments untouched", () => {
    const text = '# note\nA="a b c"\nB=  spaced-out\n';
    expect(cleanEnvWhitespace(text)).toBe(text);
  });
});
