import { describe, expect, it } from "vitest";
import {
  appendBlock,
  appendEntry,
  diffEntryRows,
  ENV_KEY_RE,
  isEnvBlock,
  parseEnvText,
  removeLine,
  removeLines,
  setEntry,
} from "./env-table.ts";

const SAMPLE = [
  "# Database",
  "DATABASE_URL=postgres://localhost/app",
  "",
  "export API_KEY = sk_test_123",
  "  INDENTED=yes",
  "not a valid line",
  "EMPTY=",
].join("\n");

describe("parseEnvText", () => {
  it("classifies entries, comments, blanks, and garbage", () => {
    const lines = parseEnvText(SAMPLE);
    expect(lines.map((l) => l.kind)).toEqual([
      "other", // comment
      "entry",
      "other", // blank
      "entry", // export-prefixed
      "entry", // indented
      "other", // garbage
      "entry", // empty value
    ]);
  });

  it("extracts keys and values, leaving prefix/spacing out of both", () => {
    const lines = parseEnvText(SAMPLE);
    const entries = lines.filter((l) => l.kind === "entry");
    expect(entries.map((e) => [e.key, e.value])).toEqual([
      ["DATABASE_URL", "postgres://localhost/app"],
      ["API_KEY", "sk_test_123"],
      ["INDENTED", "yes"],
      ["EMPTY", ""],
    ]);
  });

  it("treats full-line comments as other even when they contain =", () => {
    const [line] = parseEnvText("# FOO=bar");
    expect(line!.kind).toBe("other");
  });

  it("keeps inline comments as part of the value (documented trade-off)", () => {
    const [line] = parseEnvText("FOO=bar # not stripped");
    expect(line).toMatchObject({ kind: "entry", value: "bar # not stripped" });
  });

  it("round-trips raw lines byte-for-byte", () => {
    const lines = parseEnvText(SAMPLE);
    expect(lines.map((l) => l.raw).join("\n")).toBe(SAMPLE);
  });
});

describe("setEntry", () => {
  it("rewrites only the value, preserving prefix and = spacing", () => {
    const next = setEntry(SAMPLE, 3, { value: "sk_live_999" });
    expect(next.split("\n")[3]).toBe("export API_KEY = sk_live_999");
    // Every other line is untouched.
    expect(next.split("\n").filter((_, i) => i !== 3)).toEqual(
      SAMPLE.split("\n").filter((_, i) => i !== 3),
    );
  });

  it("rewrites the key while keeping the value", () => {
    const next = setEntry("FOO=1", 0, { key: "BAR" });
    expect(next).toBe("BAR=1");
  });

  it("is a no-op on non-entry or out-of-range lines", () => {
    expect(setEntry(SAMPLE, 0, { value: "x" })).toBe(SAMPLE); // comment
    expect(setEntry(SAMPLE, 99, { value: "x" })).toBe(SAMPLE);
  });
});

describe("removeLine", () => {
  it("removes exactly one line", () => {
    const next = removeLine("A=1\nB=2\nC=3", 1);
    expect(next).toBe("A=1\nC=3");
  });

  it("is a no-op out of range", () => {
    expect(removeLine("A=1", 5)).toBe("A=1");
  });
});

describe("appendEntry", () => {
  it("starts an empty file with a trailing newline", () => {
    expect(appendEntry("", "A", "1")).toBe("A=1\n");
  });

  it("follows the file's trailing-newline style", () => {
    expect(appendEntry("A=1\n", "B", "2")).toBe("A=1\nB=2\n");
    expect(appendEntry("A=1", "B", "2")).toBe("A=1\nB=2");
  });
});

describe("ENV_KEY_RE", () => {
  it("accepts typical keys and rejects invalid ones", () => {
    for (const ok of ["FOO", "_X", "a.b-c", "NODE_ENV2"]) {
      expect(ENV_KEY_RE.test(ok)).toBe(true);
    }
    for (const bad of ["", "1FOO", "FO O", "FOO=", "#X"]) {
      expect(ENV_KEY_RE.test(bad)).toBe(false);
    }
  });
});

describe("block paste (isEnvBlock + appendBlock)", () => {
  it("detects multi-line env blocks, including ones with comments", () => {
    expect(isEnvBlock("A=1\nB=2")).toBe(true);
    expect(isEnvBlock("# db\nDB_URL=postgres://x\n")).toBe(true);
    expect(isEnvBlock("A=1\r\nB=2")).toBe(true);
  });

  it("leaves single-line pastes and non-env text alone", () => {
    expect(isEnvBlock("A=1")).toBe(false);
    expect(isEnvBlock("plain value with = sign")).toBe(false);
    expect(isEnvBlock("just\nsome\nprose")).toBe(false);
  });

  it("appends the block verbatim, keeping comments and blank lines", () => {
    const block = "# api\nAPI_KEY=abc\n\nDB_URL=postgres://x\n";
    expect(appendBlock("A=1\n", block)).toBe(
      "A=1\n# api\nAPI_KEY=abc\n\nDB_URL=postgres://x\n",
    );
  });

  it("normalizes CRLF and follows the trailing-newline style", () => {
    expect(appendBlock("", "A=1\r\nB=2")).toBe("A=1\nB=2\n");
    expect(appendBlock("X=0", "A=1\nB=2")).toBe("X=0\nA=1\nB=2");
  });
});

describe("removeLines", () => {
  it("removes several lines at once, whatever the order given", () => {
    expect(removeLines("A=1\nB=2\nC=3\nD=4\n", [2, 0])).toBe("B=2\nD=4\n");
    expect(removeLines("A=1\nB=2\n", [1, 0])).toBe("");
    expect(removeLines("A=1\n", [5, -1])).toBe("A=1\n");
  });
});

describe("diffEntryRows", () => {
  const base = "A=1\nB=2\nC=3\n";

  it("flags added and modified rows by current line index", () => {
    const { changes, removed } = diffEntryRows(base, "A=1\nB=changed\nC=3\nD=4\n");
    expect(changes.get(0)).toBeUndefined();
    expect(changes.get(1)).toEqual({ status: "modified", baseValue: "2" });
    expect(changes.get(3)).toEqual({ status: "added" });
    expect(removed).toEqual([]);
  });

  it("lists keys missing from the current text, in baseline order", () => {
    const { changes, removed } = diffEntryRows(base, "B=2\n");
    expect(changes.size).toBe(0);
    expect(removed).toEqual([
      { key: "A", value: "1" },
      { key: "C", value: "3" },
    ]);
  });

  it("treats a renamed key as one removal plus one addition", () => {
    const { changes, removed } = diffEntryRows("OLD=1\n", "NEW=1\n");
    expect(changes.get(0)).toEqual({ status: "added" });
    expect(removed).toEqual([{ key: "OLD", value: "1" }]);
  });

  it("pairs duplicate keys by occurrence order", () => {
    const { changes, removed } = diffEntryRows("K=1\nK=2\n", "K=1\nK=other\nK=3\n");
    expect(changes.get(0)).toBeUndefined();
    expect(changes.get(1)).toEqual({ status: "modified", baseValue: "2" });
    expect(changes.get(2)).toEqual({ status: "added" });
    expect(removed).toEqual([]);
  });

  it("reports nothing when texts match", () => {
    const { changes, removed } = diffEntryRows(base, base);
    expect(changes.size).toBe(0);
    expect(removed).toEqual([]);
  });
});
