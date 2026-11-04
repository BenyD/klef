import { describe, expect, it } from "vitest";
import { canAddProjects, configForChoice, describeChoice, findChoice, namesMatch, projectChoices, type ProjectChoice } from "./setup-link.ts";
import type { VaultTree, WorkspaceNode } from "../shared/api-types.ts";

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

describe("namesMatch", () => {
  it("matches a project to its repo directory, ignoring case and punctuation", () => {
    expect(namesMatch("Lensdrop", "lensdrop")).toBe(true);
    expect(namesMatch("my-app", "My_App")).toBe(true);
    expect(namesMatch("shop-old", "unclog")).toBe(false);
    expect(namesMatch("--", "")).toBe(false);
  });
});

describe("an empty project", () => {
  const empty = choice("P", "app", []);

  it("is offered, and says it has no files yet", () => {
    const tree = { workspaces: [{ id: "w", name: "P", icon: null, createdAt: "", projects: [{ id: "p", name: "app", framework: null, icon: null, createdAt: "", files: [] }] }] } as unknown as VaultTree;
    expect(projectChoices(tree)).toEqual([{ workspace: "P", project: "app", files: [] }]);
    expect(describeChoice(empty)).toBe("P / app (no files yet)");
  });

  it("links this directory's env files, preferring .env.local", () => {
    const config = configForChoice(empty, [".dev.vars", ".env", ".env.local", ".env.production"]);
    expect(config.file).toBe(".env.local");
    expect(config.environment).toBe("development");
    expect(config.files?.map((f) => f.file)).toEqual([".env.local", ".dev.vars", ".env", ".env.production"]);
  });

  it("links .env alone when this directory has none", () => {
    const config = configForChoice(empty, []);
    expect(config).toEqual({ workspace: "P", project: "app", file: ".env", environment: null });
  });
});

describe("canAddProjects", () => {
  const ws = (team: unknown) => ({ id: "w", name: "W", icon: null, createdAt: "", projects: [], team }) as unknown as WorkspaceNode;

  it("allows your own workspace and a team you administer, not one you only belong to", () => {
    expect(canAddProjects(ws(null))).toBe(true);
    expect(canAddProjects(ws(undefined))).toBe(true);
    expect(canAddProjects(ws({ role: "owner" }))).toBe(true);
    expect(canAddProjects(ws({ role: "admin" }))).toBe(true);
    expect(canAddProjects(ws({ role: "member" }))).toBe(false);
  });
});
