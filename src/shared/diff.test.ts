import { describe, expect, it } from "vitest";
import {
  diffLines,
  diffStats,
  finalNewlineNote,
  isUnchanged,
} from "./diff.ts";

describe("diffLines", () => {
  it("reports no changes for identical text", () => {
    const text = "A=1\nB=2\n";
    expect(diffLines(text, text).every((o) => o.type === "same")).toBe(true);
    expect(isUnchanged(text, text)).toBe(true);
  });

  it("detects an added line", () => {
    const ops = diffLines("A=1\nB=2", "A=1\nB=2\nC=3");
    expect(ops.filter((o) => o.type === "add").map((o) => o.text)).toEqual(["C=3"]);
    expect(diffStats(ops)).toEqual({ added: 1, removed: 0 });
  });

  it("detects a removed line", () => {
    const ops = diffLines("A=1\nB=2\nC=3", "A=1\nC=3");
    expect(ops.filter((o) => o.type === "remove").map((o) => o.text)).toEqual(["B=2"]);
    expect(diffStats(ops)).toEqual({ added: 0, removed: 1 });
  });

  it("represents a changed value as remove + add", () => {
    const ops = diffLines("KEY=old", "KEY=new");
    expect(diffStats(ops)).toEqual({ added: 1, removed: 1 });
    expect(ops.find((o) => o.type === "remove")?.text).toBe("KEY=old");
    expect(ops.find((o) => o.type === "add")?.text).toBe("KEY=new");
  });

  it("preserves order and unchanged context", () => {
    const ops = diffLines("A=1\nB=2\nC=3", "A=1\nB=22\nC=3");
    expect(ops.map((o) => `${o.type[0]}:${o.text}`)).toEqual([
      "s:A=1",
      "r:B=2",
      "a:B=22",
      "s:C=3",
    ]);
  });

  it("treats CRLF and LF as equal", () => {
    expect(isUnchanged("A=1\r\nB=2", "A=1\nB=2")).toBe(true);
    expect(diffStats(diffLines("A=1\r\nB=2", "A=1\nB=2"))).toEqual({ added: 0, removed: 0 });
  });

  it("handles empty old (first save) and empty new (cleared)", () => {
    expect(diffStats(diffLines("", "A=1\nB=2"))).toEqual({ added: 2, removed: 0 });
    expect(diffStats(diffLines("A=1\nB=2", ""))).toEqual({ added: 0, removed: 2 });
  });

  it("does not count a trailing newline as an extra line (git-style)", () => {
    // A pasted 2-key file ending in a newline is 2 added lines, not 3.
    expect(diffStats(diffLines("", "A=1\nB=2\n"))).toEqual({
      added: 2,
      removed: 0,
    });
    expect(diffLines("", "A=1\nB=2\n").map((o) => o.text)).toEqual([
      "A=1",
      "B=2",
    ]);
  });

  it("shows no line ops for a newline-only change, but isUnchanged is false", () => {
    expect(diffStats(diffLines("A=1\n", "A=1"))).toEqual({ added: 0, removed: 0 });
    expect(isUnchanged("A=1\n", "A=1")).toBe(false);
    expect(isUnchanged("A=1", "A=1\n")).toBe(false);
  });

  it("still counts interior blank lines", () => {
    expect(diffStats(diffLines("", "A=1\n\nB=2\n"))).toEqual({
      added: 3,
      removed: 0,
    });
  });

  it("treats a lone newline as one empty line", () => {
    expect(diffStats(diffLines("", "\n"))).toEqual({ added: 1, removed: 0 });
  });
});

describe("finalNewlineNote", () => {
  it("is null when both sides end with a newline", () => {
    expect(finalNewlineNote("A=1\n", "A=1\nB=2\n")).toBeNull();
    expect(finalNewlineNote("A=1\r\n", "A=1\n")).toBeNull();
  });

  it("flags a new text missing its final newline", () => {
    expect(finalNewlineNote("A=1\n", "A=1")).toBe("No newline at end of file");
    // A first save without a trailing newline is flagged too.
    expect(finalNewlineNote("", "A=1")).toBe("No newline at end of file");
    // Both sides missing: the state is still worth surfacing.
    expect(finalNewlineNote("A=1", "A=1\nB=2")).toBe(
      "No newline at end of file",
    );
  });

  it("flags a newline being added at the end", () => {
    expect(finalNewlineNote("A=1", "A=1\n")).toBe(
      "Newline added at end of file",
    );
  });

  it("is null for empty new text and for a clean first save", () => {
    expect(finalNewlineNote("A=1", "")).toBeNull();
    expect(finalNewlineNote("", "A=1\n")).toBeNull();
    expect(finalNewlineNote("", "")).toBeNull();
  });
});
