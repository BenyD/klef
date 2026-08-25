import { describe, expect, it } from "vitest";
import { listTargets, ResolveError, resolveTarget } from "./resolve.ts";
import type { VaultTree } from "../shared/api-types.ts";

const TREE: VaultTree = {
  workspaces: [
    {
      id: "w1",
      name: "Personal",
      icon: null,
      createdAt: "2026-01-01",
      projects: [
        {
          id: "p1",
          name: "klef",
          framework: null,
          icon: null,
          createdAt: "2026-01-01",
          files: [
            {
              id: "f1",
              name: ".env",
              currentVersionId: "v1",
              environment: "development",
              createdAt: "2026-01-01",
            },
            {
              id: "f2",
              name: ".env.production",
              currentVersionId: null,
              environment: "production",
              createdAt: "2026-01-01",
            },
          ],
        },
      ],
    },
    { id: "w2", name: "Work", icon: null, createdAt: "2026-01-01", projects: [] },
  ],
};

const TARGET = { workspace: "Personal", project: "klef", file: ".env" };

describe("resolveTarget", () => {
  it("resolves names to ids", () => {
    expect(resolveTarget(TREE, TARGET)).toMatchObject({
      workspaceId: "w1",
      projectId: "p1",
      fileId: "f1",
      environment: "development",
      currentVersionId: "v1",
    });
  });

  it("matches case-insensitively but reports the stored casing", () => {
    const resolved = resolveTarget(TREE, { ...TARGET, workspace: "personal" });
    expect(resolved.workspaceId).toBe("w1");
    expect(resolved.workspaceName).toBe("Personal");
  });

  it("tolerates stray whitespace in the config", () => {
    expect(resolveTarget(TREE, { ...TARGET, project: "  klef " }).projectId).toBe("p1");
  });

  it("surfaces a file that exists but has never been saved", () => {
    const resolved = resolveTarget(TREE, { ...TARGET, file: ".env.production" });
    expect(resolved.currentVersionId).toBeNull();
  });

  it("names the available workspaces when the workspace is wrong", () => {
    expect(() => resolveTarget(TREE, { ...TARGET, workspace: "Nope" })).toThrow(
      ResolveError,
    );
    expect(() => resolveTarget(TREE, { ...TARGET, workspace: "Nope" })).toThrow(
      /"Personal", "Work"/,
    );
  });

  it("names the available projects within the right workspace", () => {
    expect(() => resolveTarget(TREE, { ...TARGET, project: "other" })).toThrow(/"klef"/);
  });

  it("reports an empty workspace honestly rather than listing nothing", () => {
    expect(() =>
      resolveTarget(TREE, { workspace: "Work", project: "any", file: ".env" }),
    ).toThrow(/\(none\)/);
  });

  it("names the available files when the file is wrong", () => {
    expect(() => resolveTarget(TREE, { ...TARGET, file: ".env.local" })).toThrow(
      /"\.env", "\.env\.production"/,
    );
  });
});

describe("listTargets", () => {
  it("flattens every file into a readable path", () => {
    expect(listTargets(TREE)).toEqual([
      "Personal / klef / .env",
      "Personal / klef / .env.production",
    ]);
  });

  it("returns nothing for an empty vault", () => {
    expect(listTargets({ workspaces: [] })).toEqual([]);
  });
});
