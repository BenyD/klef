import { describe, expect, it } from "vitest";
import { hasAwkwardQuoting, shellQuote } from "./shell.ts";

describe("shellQuote", () => {
  // Workspace and project names are free text. One containing a quote or a
  // space would otherwise produce a command that silently targets the wrong
  // thing, and one containing $() would produce a command that runs something.
  it("survives a shell for names people actually have", () => {
    expect(shellQuote("Beny's Team")).toBe("'Beny'\\''s Team'");
    expect(shellQuote("Lensdrop")).toBe("'Lensdrop'");
    expect(shellQuote(".env.local")).toBe("'.env.local'");
  });

  it("neutralises anything that would execute", () => {
    for (const hostile of ["$(whoami)", "`id`", "; rm -rf /", "a && b"]) {
      const quoted = shellQuote(hostile);
      expect(quoted.startsWith("'")).toBe(true);
      expect(quoted.endsWith("'")).toBe(true);
      // Inside single quotes a shell expands nothing, and the only way out is
      // a bare quote, which is what the escape handles.
      expect(quoted.slice(1, -1)).not.toMatch(/(^|[^\\])'/);
    }
  });

  it("quotes the empty string rather than vanishing", () => {
    expect(shellQuote("")).toBe("''");
  });
});

describe("hasAwkwardQuoting", () => {
  it("flags only names that need the escape", () => {
    expect(hasAwkwardQuoting("Beny's Team")).toBe(true);
    expect(hasAwkwardQuoting("Maxapp GmbH")).toBe(false);
    expect(hasAwkwardQuoting("Ewig")).toBe(false);
  });
});
