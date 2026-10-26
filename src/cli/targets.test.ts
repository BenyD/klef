import { describe, expect, it } from "vitest";
import type { ProjectConfig } from "./project-config.ts";
import { syncTargets, UsageError } from "./targets.ts";

const LINKED: ProjectConfig = {
  workspace: "Personal",
  project: "lensdrop",
  file: ".env.local",
  environment: null,
};

const WITH_FILES: ProjectConfig = {
  ...LINKED,
  files: [
    { file: ".env.local", path: ".env.local" },
    { file: ".env.production", path: ".env.production" },
    { file: "mobile.env.local", path: "apps/mobile/.env.local" },
  ],
};

const none = { all: false, file: null, path: null };

describe("syncTargets", () => {
  it("is the linked file at its own name by default", () => {
    expect(syncTargets(LINKED, none)).toEqual([{ file: ".env.local", path: null }]);
  });

  it("honours --file and --path", () => {
    expect(syncTargets(LINKED, { all: false, file: ".env.production", path: "prod.env" })).toEqual(
      [{ file: ".env.production", path: "prod.env" }],
    );
  });

  it("takes the local path from the files list when --file names an entry", () => {
    expect(syncTargets(WITH_FILES, { ...none, file: "mobile.env.local" })).toEqual([
      { file: "mobile.env.local", path: "apps/mobile/.env.local" },
    ]);
  });

  it("lets --path override the files list", () => {
    expect(
      syncTargets(WITH_FILES, { all: false, file: "mobile.env.local", path: "m.env" }),
    ).toEqual([{ file: "mobile.env.local", path: "m.env" }]);
  });

  it("covers every listed file with --all", () => {
    expect(syncTargets(WITH_FILES, { ...none, all: true })).toEqual(WITH_FILES.files);
  });

  it("covers just the linked file with --all when nothing is listed", () => {
    expect(syncTargets(LINKED, { ...none, all: true })).toEqual([
      { file: ".env.local", path: ".env.local" },
    ]);
  });

  it("refuses --all combined with --file or --path", () => {
    expect(() => syncTargets(WITH_FILES, { all: true, file: ".env", path: null })).toThrow(
      UsageError,
    );
    expect(() => syncTargets(WITH_FILES, { all: true, file: null, path: ".env" })).toThrow(
      UsageError,
    );
  });
});
