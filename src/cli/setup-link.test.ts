import { describe, expect, it } from "vitest";
import { configForChoice, findChoice, type ProjectChoice } from "./setup-link.ts";

const choice = (workspace: string, project: string, files: string[]): ProjectChoice => ({
  workspace,
  project,
  files: files.map((name) => ({ name, environment: null })),
});

describe("findChoice", () => {
  const choices = [
    choice("Personal", "api", [".env"]),
    choice("Work", "api", [".env"]),
    choice("Work", "web", [".env"]),
  ];

  it("matches a unique project by name alone, ignoring case", () => {
    expect(findChoice(choices, null, "WEB")?.workspace).toBe("Work");
  });

  // Guessing between two projects of the same name would link the wrong one.
  it("refuses an ambiguous name unless the workspace settles it", () => {
    expect(findChoice(choices, null, "api")).toBeNull();
    expect(findChoice(choices, "personal", "api")?.workspace).toBe("Personal");
  });
});

describe("configForChoice", () => {
  it("lists every file for --all and defaults to .env.local", () => {
    const config = configForChoice(choice("P", "app", [".env.production", ".env.local"]));
    expect(config.file).toBe(".env.local");
    expect(config.files).toEqual([
      { file: ".env.production", path: ".env.production" },
      { file: ".env.local", path: ".env.local" },
    ]);
  });

  it("falls back to the first file when there is no .env.local or .env", () => {
    expect(configForChoice(choice("P", "app", ["prod.env", "dev.env"])).file).toBe("prod.env");
  });
});
