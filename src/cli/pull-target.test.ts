import { describe, expect, it } from "vitest";
import { pullTarget } from "./commands/pull.ts";
import type { ProjectConfig } from "./project-config.ts";

const LINKED: ProjectConfig = {
  workspace: "Personal",
  project: "klef",
  file: ".env",
  environment: "development",
};

describe("pullTarget", () => {
  it("pulls the linked file when no flag is given", () => {
    expect(pullTarget(LINKED, null)).toEqual(LINKED);
  });

  // The bug this guards: `--file` was documented in `klef help` and honoured by
  // `link`, but `pull` ignored it and silently fetched the linked file instead.
  // Asking for production and getting development, with no error, is the worst
  // possible failure for a secrets tool.
  it("lets --file name a sibling file in the same project", () => {
    const target = pullTarget(LINKED, ".env.production");
    expect(target.file).toBe(".env.production");
    expect(target.workspace).toBe("Personal");
    expect(target.project).toBe("klef");
  });

  it("does not mutate the linked config", () => {
    pullTarget(LINKED, ".env.production");
    expect(LINKED.file).toBe(".env");
  });
});
