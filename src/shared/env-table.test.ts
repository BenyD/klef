import { describe, expect, it } from "vitest";
import {
  pickEntries,
  appendBlock,
  appendEntry,
  diffEntryRows,
  ENV_KEY_RE,
  fullValue,
  isEnvBlock,
  parseEnvText,
  removeLine,
  removeLines,
  replaceEntryValue,
  setEntry,
  splitEntryLine,
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

describe("splitEntryLine", () => {
  it("splits a single KEY=value line, keeping the value as typed", () => {
    expect(splitEntryLine("STRIPE_KEY=sk_test_1=2")).toEqual({
      key: "STRIPE_KEY",
      value: "sk_test_1=2",
    });
    expect(splitEntryLine("export API = x\n")).toEqual({ key: "API", value: "x" });
  });

  it("leaves anything else to paste as typed", () => {
    expect(splitEntryLine("JUST_A_KEY")).toBeNull();
    expect(splitEntryLine("# A=1")).toBeNull();
    expect(splitEntryLine("A=1\nB=2")).toBeNull();
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

const entriesOf = (text: string) =>
  parseEnvText(text).flatMap((l) => (l.kind === "entry" ? [[l.key, fullValue(l)]] : []));

describe("CRLF files", () => {
  const crlf = "# App\r\nA=1\r\nexport B = two\r\n";

  it("parse like LF ones, keeping the \\r out of values and in raw", () => {
    expect(entriesOf(crlf)).toEqual([
      ["A", "1"],
      ["B", "two"],
    ]);
    const a = parseEnvText(crlf)[1]!;
    expect(a.raw).toBe("A=1\r");
  });

  it("keep every \\r through an edit", () => {
    expect(setEntry(crlf, 1, { value: "9" })).toBe("# App\r\nA=9\r\nexport B = two\r\n");
    expect(setEntry(crlf, 2, { key: "C" })).toBe("# App\r\nA=1\r\nexport C = two\r\n");
  });
});

describe("values holding other line breaks", () => {
  it("keeps a key whose value has a lone \\r, U+2028 or U+2029", () => {
    for (const odd of ["\r", "\u2028", "\u2029"]) {
      expect(entriesOf(`A=x${odd}y\nB=2\n`)).toEqual([
        ["A", `x${odd}y`],
        ["B", "2"],
      ]);
    }
  });
});

describe("multi-line quoted values", () => {
  const PEM = 'A=1\nKEY="-----BEGIN KEY-----\nMIIEabc\nTail123==\n-----END KEY-----"\nB=2\n';

  it("are one entry whose continuation lines are never keys", () => {
    const lines = parseEnvText(PEM);
    expect(lines.map((l) => l.kind)).toEqual(["entry", "entry", "other", "other", "other", "entry", "other"]);
    expect(entriesOf(PEM).map(([k]) => k)).toEqual(["A", "KEY", "B"]);
  });

  it("carry the whole value, joined with \\n even in a CRLF file", () => {
    const key = parseEnvText(PEM)[1]!;
    expect(key.kind === "entry" && key.value).toBe('"-----BEGIN KEY-----');
    expect(key.kind === "entry" && key.span).toEqual({ end: 4, value: '"-----BEGIN KEY-----\nMIIEabc\nTail123==\n-----END KEY-----"' });
    expect(entriesOf(PEM.replace(/\n/g, "\r\n"))[1]).toEqual(["KEY", '"-----BEGIN KEY-----\nMIIEabc\nTail123==\n-----END KEY-----"']);
  });

  it("close on the matching quote, past escaped double quotes", () => {
    expect(entriesOf("A='one\nB=two'\nC=3\n")).toEqual([
      ["A", "'one\nB=two'"],
      ["C", "3"],
    ]);
    expect(entriesOf('A="say \\"\nB=x"\nC=3\n')).toEqual([
      ["A", '"say \\"\nB=x"'],
      ["C", "3"],
    ]);
    expect(entriesOf("A=`one\nB=two`\n")).toEqual([["A", "`one\nB=two`"]]);
  });

  it("read a quote that never closes as a one-line value, not the rest of the file", () => {
    expect(entriesOf('A="oops\nB=2\nC=3\n')).toEqual([
      ["A", '"oops'],
      ["B", "2"],
      ["C", "3"],
    ]);
  });

  it("are removed whole, continuation lines and all", () => {
    expect(removeLine(PEM, 1)).toBe("A=1\nB=2\n");
    expect(removeLines(PEM, [5, 1])).toBe("A=1\n");
  });

  it("are replaced whole by replaceEntryValue, while setEntry edits the opening line", () => {
    expect(replaceEntryValue(PEM, 1, "new")).toBe("A=1\nKEY=new\nB=2\n");
    expect(replaceEntryValue(PEM, 1, '"x\ny"')).toBe('A=1\nKEY="x\ny"\nB=2\n');
    expect(replaceEntryValue("A=1\r\nB=2\r\n", 0, '"x\ny"')).toBe('A="x\r\ny"\r\nB=2\r\n');
    expect(setEntry(PEM, 1, { key: "PEM" })).toBe(PEM.replace("KEY=", "PEM="));
  });

  it("count as modified when only a continuation line changed", () => {
    const { changes } = diffEntryRows(PEM, PEM.replace("MIIEabc", "MIIExyz"));
    expect(changes.get(1)).toEqual({ status: "modified", baseValue: '"-----BEGIN KEY-----' });
  });
});

describe("a leading byte order mark", () => {
  it("leaves the first key readable and stays in the line", () => {
    const text = "\uFEFFA=1\nB=2\n";
    expect(entriesOf(text)).toEqual([
      ["A", "1"],
      ["B", "2"],
    ]);
    expect(setEntry(text, 0, { value: "9" })).toBe("\uFEFFA=9\nB=2\n");
  });

  it("picks the selected entries' lines byte for byte, multi-line values whole", () => {
    const text = '# Head\r\nA=1\r\nCERT="line 1\r\nline 2"\r\nB=2\r\n';
    const lines = parseEnvText(text);
    const a = lines.findIndex((l) => l.kind === "entry" && l.key === "A");
    const cert = lines.findIndex((l) => l.kind === "entry" && l.key === "CERT");
    expect(pickEntries(text, [cert, a])).toBe('A=1\r\nCERT="line 1\r\nline 2"\r\n');
    expect(pickEntries(text, [0])).toBe("");
  });
});
