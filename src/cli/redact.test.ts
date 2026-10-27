import { describe, expect, it } from "vitest";
import { createRedactor, MIN_REDACT_LENGTH, REDACTED, redactable } from "./redact.ts";

const SECRET = "sk_live_abcdefghijklmnop";

describe("redactable", () => {
  it("drops values too short to mask safely, and settings that are never secret", () => {
    expect(redactable(["1", "true", "3000", "false", "production", "localhost", SECRET])).toEqual([SECRET]);
    expect(MIN_REDACT_LENGTH).toBe(5);
  });

  it("keeps a value exactly at the minimum", () => {
    expect(redactable(["12345"])).toEqual(["12345"]);
  });

  it("orders longest first, so a value containing another is masked whole", () => {
    expect(redactable(["short1", "a much longer value", "mid value"])).toEqual([
      "a much longer value",
      "mid value",
      "short1",
    ]);
  });

  it("collapses duplicates", () => {
    expect(redactable([SECRET, SECRET])).toHaveLength(1);
  });
});

describe("createRedactor", () => {
  it("replaces every occurrence in complete lines and counts them", () => {
    const r = createRedactor([SECRET]);
    expect(r.write(`key=${SECRET} again ${SECRET}\nplain line\n`)).toBe(
      `key=${REDACTED} again ${REDACTED}\nplain line\n`,
    );
    expect(r.redactions).toBe(2);
  });

  it("holds a partial line until the newline arrives", () => {
    const r = createRedactor([SECRET]);
    expect(r.write("waiting for the rest")).toBe("");
    expect(r.write(" of it\n")).toBe("waiting for the rest of it\n");
  });

  it("masks a value split across chunks", () => {
    const r = createRedactor([SECRET]);
    const [head, tail] = [SECRET.slice(0, 7), SECRET.slice(7)];
    let out = r.write(`token: ${head}`);
    out += r.write(`${tail} end\n`);
    expect(out).toBe(`token: ${REDACTED} end\n`);
    expect(out).not.toContain(head);
    expect(r.redactions).toBe(1);
  });

  it("masks a value split across three chunks of one character each at the edges", () => {
    const r = createRedactor([SECRET]);
    let out = "";
    for (const ch of `${SECRET}\n`) out += r.write(ch);
    expect(out).toBe(`${REDACTED}\n`);
  });

  it("treats a carriage return as a line end, for progress bars", () => {
    const r = createRedactor([SECRET]);
    expect(r.write(`10% ${SECRET}\r20%`)).toBe(`10% ${REDACTED}\r`);
    expect(r.flush()).toBe("20%");
  });

  it("flushes what is held, redacted, at the end", () => {
    const r = createRedactor([SECRET]);
    expect(r.write(`no newline ${SECRET}`)).toBe("");
    expect(r.flush()).toBe(`no newline ${REDACTED}`);
    expect(r.flush()).toBe("");
  });

  it("leaves text without a value untouched, byte for byte", () => {
    const r = createRedactor([SECRET]);
    const text = "  indented\ttabs \u001b[32mcolour\u001b[0m\n\n";
    expect(r.write(text)).toBe(text);
    expect(r.redactions).toBe(0);
  });

  it("masks a longer value whole when a shorter one is inside it", () => {
    const r = createRedactor(redactable(["abcdefghij", "cdefg"]));
    expect(r.write("abcdefghij and cdefg\n")).toBe(`${REDACTED} and ${REDACTED}\n`);
  });

  it("masks nothing when given no values", () => {
    const r = createRedactor([]);
    expect(r.write(`${SECRET}\n`)).toBe(`${SECRET}\n`);
  });
});
