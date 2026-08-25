import { describe, expect, it } from "vitest";
import {
  countVariables,
  describePush,
  describeWrite,
  redactAssignments,
} from "./output.ts";
import { keysOf } from "../web/lib/env-drift.ts";

describe("countVariables", () => {
  it("counts assignments, ignoring comments and blank lines", () => {
    expect(
      countVariables("# Heading\n\nA=1\nB=2\n\n# another\nC=3\n"),
    ).toBe(3);
  });

  it("counts an exported assignment once", () => {
    expect(countVariables("export A=1\nB=2\n")).toBe(2);
  });

  it("counts unique keys, so a repeated key counts once", () => {
    // Matches dotenv loaders, where the last occurrence wins.
    expect(countVariables("A=1\nA=2\nB=3\n")).toBe(2);
  });

  it("agrees with the web app on multi-line values", () => {
    // env-table parses line by line to keep mutations byte-safe, so a
    // continuation line that itself looks like an assignment counts as one.
    // Documented here because the CLI and the UI must report the same number —
    // a count that disagreed with the app would be worse than an imprecise one.
    const text = 'KEY="-----BEGIN KEY-----\njkl=\n-----END KEY-----"\nB=2\n';
    expect(countVariables(text)).toBe(keysOf(text).length);
  });

  it("ignores lines that are not assignments", () => {
    expect(countVariables("just words\n=novalue\n  \n")).toBe(0);
  });

  it("counts an empty value as a variable", () => {
    expect(countVariables("EMPTY=\n")).toBe(1);
  });

  it("returns zero for empty input", () => {
    expect(countVariables("")).toBe(0);
  });
});

describe("describeWrite", () => {
  it("reports a count and a path, and never a value", () => {
    expect(describeWrite({ path: ".env", variableCount: 14 })).toBe(
      "Wrote 14 variables to .env",
    );
  });

  it("uses the singular for one variable", () => {
    expect(describeWrite({ path: ".env", variableCount: 1 })).toBe(
      "Wrote 1 variable to .env",
    );
  });
});

describe("describePush", () => {
  it("reports shape, never content", () => {
    const out = describePush({ variableCount: 12, added: 3, removed: 1 });
    expect(out).toBe("12 variables (+3 -1 lines)");
  });

  it("omits a side that did not change", () => {
    expect(describePush({ variableCount: 4, added: 2, removed: 0 })).toBe(
      "4 variables (+2 lines)",
    );
    expect(describePush({ variableCount: 4, added: 0, removed: 2 })).toBe(
      "4 variables (-2 lines)",
    );
  });

  it("says so plainly when only formatting moved", () => {
    expect(describePush({ variableCount: 9, added: 0, removed: 0 })).toBe(
      "9 variables, no line changes",
    );
  });

  it("uses the singular for one variable", () => {
    expect(describePush({ variableCount: 1, added: 1, removed: 0 })).toBe(
      "1 variable (+1 lines)",
    );
  });
});

describe("redactAssignments", () => {
  it("keeps the key and drops the value", () => {
    expect(redactAssignments("API_KEY=sk_live_92Fk1p")).toBe("API_KEY=<redacted>");
  });

  it("redacts every line, including exported ones", () => {
    const out = redactAssignments("export A=one\nB=two\n");
    expect(out).not.toContain("one");
    expect(out).not.toContain("two");
  });

  it("leaves comments and prose alone", () => {
    expect(redactAssignments("# a comment\nplain text")).toBe("# a comment\nplain text");
  });
});

describe("the redaction backstop is actually wired", () => {
  // It was defined and tested but never called for most of a day, which made
  // "no value is ever printed" a claim about intent rather than about code.
  it("is used by the CLI's top-level error handler", async () => {
    const { readFile } = await import("node:fs/promises");
    const entry = await readFile(new URL("./index.ts", import.meta.url), "utf8");
    expect(entry).toContain("redactAssignments(");
  });
});
