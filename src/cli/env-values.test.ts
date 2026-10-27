import { describe, expect, it } from "vitest";
import { envValues, unquote } from "./env-values.ts";

// `klef run` has to give a process the same variables the framework's own
// .env loading would give it after `klef pull`, so these follow dotenv.

describe("envValues", () => {
  it("reads plain, exported and spaced assignments, skipping comments and blanks", () => {
    const values = envValues("# App\nA=1\nexport B = two\n\n  C=3\nnot a line\n");
    expect([...values]).toEqual([
      ["A", "1"],
      ["B", "two"],
      ["C", "3"],
    ]);
  });

  it("strips matching quotes of all three kinds", () => {
    const values = envValues(`A="double"\nB='single'\nC=\`back\`\n`);
    expect(values.get("A")).toBe("double");
    expect(values.get("B")).toBe("single");
    expect(values.get("C")).toBe("back");
  });

  it("expands \\n only inside double quotes", () => {
    expect(envValues(`A="x\\ny"\n`).get("A")).toBe("x\ny");
    expect(envValues(`A='x\\ny'\n`).get("A")).toBe("x\\ny");
    expect(envValues(`A=x\\ny\n`).get("A")).toBe("x\\ny");
  });

  it("cuts an unquoted value at a comment, and keeps # inside quotes", () => {
    expect(envValues("A=value # note\n").get("A")).toBe("value");
    expect(envValues("A=#ff0000\n").get("A")).toBe("");
    expect(envValues('A="#ff0000" # colour\n').get("A")).toBe("#ff0000");
  });

  it("joins a quoted value that spans lines", () => {
    const pem = "-----BEGIN KEY-----\nabc\ndef\n-----END KEY-----";
    const values = envValues(`KEY="${pem}"\nNEXT=1\n`);
    expect(values.get("KEY")).toBe(pem);
    expect(values.get("NEXT")).toBe("1");
    expect(values.size).toBe(2);
  });

  it("reads an unclosed quote as a plain value on its own line", () => {
    const values = envValues(`A="oops\nB=2\n`);
    expect(values.get("A")).toBe('"oops');
    expect(values.get("B")).toBe("2");
  });

  it("lets the last of a repeated key win", () => {
    expect(envValues("A=1\nA=2\n").get("A")).toBe("2");
  });

  it("treats CRLF files like LF ones", () => {
    expect([...envValues("A=1\r\nB=2\r\n")]).toEqual([
      ["A", "1"],
      ["B", "2"],
    ]);
  });

  it("keeps an empty value empty", () => {
    expect(envValues("A=\nB=''\n").get("A")).toBe("");
    expect(envValues("A=\nB=''\n").get("B")).toBe("");
  });
});

describe("unquote", () => {
  it("trims an unquoted value and leaves inner spaces", () => {
    expect(unquote("  a b  ")).toBe("a b");
    expect(unquote('" a b "')).toBe(" a b ");
  });
});
