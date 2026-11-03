import { describe, expect, it } from "vitest";
import { rawValueOf, setKey } from "./set-key.ts";

describe("setKey", () => {
  it("edits a key in a CRLF file in place instead of appending a duplicate", () => {
    expect(setKey("A=1\r\nB=2\r\n", "A", "9")).toEqual({ text: "A=9\r\nB=2\r\n", added: false });
  });

  it("replaces every line of a multi-line value", () => {
    const text = 'A=1\nKEY="-----BEGIN-----\nold\n-----END-----"\nB=2\n';
    expect(setKey(text, "KEY", "new")).toEqual({ text: "A=1\nKEY=new\nB=2\n", added: false });
  });

  it("does not take a line inside a multi-line value for a key", () => {
    const text = 'KEY="BEGIN\nX=inside\nEND"\n';
    expect(setKey(text, "X", "1")).toEqual({ text: `${text}X=1\n`, added: true });
  });
});

describe("rawValueOf", () => {
  it("returns a multi-line value whole", () => {
    expect(rawValueOf('KEY="a\nb"\n', "KEY")).toBe('"a\nb"');
  });
});
