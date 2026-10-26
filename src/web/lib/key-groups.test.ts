import { describe, expect, it } from "vitest";
import { filterKeyGroups, groupKeys, type KeyedFile } from "./key-groups.ts";

const file = (
  fileId: string,
  fileName: string,
  projectId: string,
  environment: string | null,
  keys: string[],
  workspaceId = "w1",
): KeyedFile => ({
  fileId,
  fileName,
  projectId,
  project: projectId === "lens" ? "Lensdrop" : projectId,
  workspaceId,
  workspace: workspaceId === "w1" ? "Team" : "Side",
  environment,
  keys,
});

const files: KeyedFile[] = [
  file("l-local", ".env.local", "lens", "development", [
    "STRIPE_KEY",
    "DATABASE_URL",
  ]),
  file("l-prod", ".env.production", "lens", "production", [
    "STRIPE_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "DATABASE_URL",
  ]),
  file("a-env", ".env", "api", null, ["DATABASE_URL"], "w2"),
];

describe("groupKeys", () => {
  const groups = groupKeys(files);
  const byKey = (k: string) => groups.find((g) => g.key === k)!;

  it("returns one group per key, alphabetically", () => {
    expect(groups.map((g) => g.key)).toEqual([
      "DATABASE_URL",
      "STRIPE_KEY",
      "STRIPE_WEBHOOK_SECRET",
    ]);
  });

  it("groups the files that set a key by project", () => {
    const db = byKey("DATABASE_URL");
    expect(db.fileCount).toBe(3);
    // By workspace, then project: Side/api before Team/Lensdrop.
    expect(db.projects.map((p) => p.project)).toEqual(["api", "Lensdrop"]);
    expect(db.projects[1]?.present.map((f) => f.fileName)).toEqual([
      ".env.local",
      ".env.production",
    ]);
  });

  it("lists a project's other files as missing the key", () => {
    const webhook = byKey("STRIPE_WEBHOOK_SECRET");
    expect(webhook.gaps).toBe(1);
    expect(webhook.projects[0]?.missing.map((f) => f.fileName)).toEqual([
      ".env.local",
    ]);
  });

  it("never reports a gap in a project that doesn't use the key", () => {
    // api has no Stripe keys at all: that's not drift, it's a different app.
    expect(byKey("STRIPE_KEY").projects.map((p) => p.project)).toEqual([
      "Lensdrop",
    ]);
    expect(byKey("STRIPE_KEY").gaps).toBe(0);
  });

  it("counts a key once per file even if the file repeats it", () => {
    const dup = groupKeys([file("x", ".env", "p", null, ["A", "A"])]);
    expect(dup[0]?.fileCount).toBe(1);
  });
});

describe("filterKeyGroups", () => {
  const groups = groupKeys(files);
  const keys = (r: ReturnType<typeof filterKeyGroups>) =>
    r.map((x) => x.group.key);

  it("ranks fuzzy matches on the key name and marks them", () => {
    const r = filterKeyGroups(groups, { query: "stripe" });
    expect(keys(r)).toEqual(["STRIPE_KEY", "STRIPE_WEBHOOK_SECRET"]);
    expect(r[0]?.highlight).toEqual([0, 1, 2, 3, 4, 5]);
    expect(keys(filterKeyGroups(groups, { query: "swh" }))).toEqual([
      "STRIPE_WEBHOOK_SECRET",
    ]);
  });

  it("filters to one workspace", () => {
    const r = filterKeyGroups(groups, { workspaceId: "w2" });
    expect(keys(r)).toEqual(["DATABASE_URL"]);
    expect(r[0]?.group.fileCount).toBe(1);
  });

  it("filters to one environment, keeping only that environment's files", () => {
    const r = filterKeyGroups(groups, { environment: "development" });
    expect(keys(r)).toEqual(["DATABASE_URL", "STRIPE_KEY"]);
    expect(r[0]?.group.projects[0]?.present.map((f) => f.fileId)).toEqual([
      "l-local",
    ]);
  });

  it("shows only keys with gaps, the most-missing first", () => {
    const withGap = groupKeys([
      ...files,
      file("l-prev", ".env.preview", "lens", "preview", ["STRIPE_KEY"]),
    ]);
    const r = filterKeyGroups(withGap, { gapsOnly: true });
    // DATABASE_URL and the webhook secret are each missing from one or two
    // Lensdrop files; the webhook secret from two (local, preview).
    expect(keys(r)).toEqual([
      "STRIPE_WEBHOOK_SECRET",
      "DATABASE_URL",
    ]);
    expect(r[0]?.group.gaps).toBe(2);
  });

  it("drops projects with nothing missing from the gaps view", () => {
    const shared = groupKeys([
      ...files,
      file("a-prod", ".env.production", "api", "production", ["OTHER"], "w2"),
    ]);
    // api is missing DATABASE_URL in .env.production; Lensdrop has it in
    // both files, so only api is listed.
    const [db] = filterKeyGroups(shared, { gapsOnly: true, query: "database" });
    expect(db?.group.projects.map((p) => p.project)).toEqual(["api"]);
  });

  it("finds a key missing from an environment in the gaps view", () => {
    const r = filterKeyGroups(groups, {
      environment: "development",
      gapsOnly: true,
    });
    expect(keys(r)).toEqual(["STRIPE_WEBHOOK_SECRET"]);
    expect(r[0]?.group.fileCount).toBe(0);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterKeyGroups(groups, { query: "zzz" })).toEqual([]);
  });
});
