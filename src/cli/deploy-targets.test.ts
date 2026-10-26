import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deployPlan, describeScope, readWorkerName, validSecretName } from "./deploy-targets.ts";
import { formatDrift, nameDrift, vercelValueDrift } from "./deploy-drift.ts";
import type { ProjectConfig } from "./project-config.ts";

const CONFIG: ProjectConfig = {
  workspace: "Personal",
  project: "lensdrop",
  file: ".env.local",
  environment: null,
  files: [
    { file: ".env.local", path: ".env.local" },
    { file: ".env.production", path: ".env.production" },
    { file: "mobile.env", path: "apps/mobile/.env" },
  ],
};
const none = { file: null, env: null, name: null, all: false };

describe("deployPlan", () => {
  it("maps each Vercel file to its environment, skipping ones it cannot place", () => {
    expect(deployPlan("vercel", CONFIG, none).map((i) => [i.entry.file, i.scope.environment])).toEqual([
      [".env.local", "development"],
      [".env.production", "production"],
    ]);
  });

  it("lets --env place a file Vercel would not", () => {
    const [item] = deployPlan("vercel", CONFIG, { ...none, file: "mobile.env", env: "preview" });
    expect(item).toEqual({
      entry: { file: "mobile.env", path: "apps/mobile/.env" },
      scope: { kind: "vercel", environment: "preview", worker: null },
    });
    expect(() => deployPlan("vercel", CONFIG, { ...none, file: "mobile.env" })).toThrow(/--env/);
  });

  it("gives GitHub and Cloudflare the production file by default", () => {
    expect(deployPlan("github", CONFIG, none)[0]!.entry.file).toBe(".env.production");
    expect(deployPlan("cloudflare", CONFIG, none)[0]!.scope).toEqual({
      kind: "cloudflare",
      environment: null,
      worker: null,
    });
  });

  it("refuses what would be ambiguous", () => {
    expect(() => deployPlan("github", CONFIG, { ...none, all: true })).toThrow(/one file/);
    expect(() => deployPlan("github", CONFIG, { ...none, name: "w" })).toThrow(/--name/);
    expect(() => deployPlan("cloudflare", CONFIG, { ...none, file: ".env.local" })).toThrow(/--env or --name/);
    const noProd = { ...CONFIG, files: [{ file: ".env.local", path: ".env.local" }] };
    expect(() => deployPlan("github", noProd, none)).toThrow(/No production file/);
  });
});

describe("describeScope", () => {
  it("names where values land", () => {
    expect(describeScope({ kind: "vercel", environment: "production", worker: null })).toBe("Vercel Production");
    expect(describeScope({ kind: "github", environment: null, worker: null })).toBe("GitHub repository secrets");
    expect(describeScope({ kind: "cloudflare", environment: "staging", worker: null }, "api")).toBe(
      'Cloudflare Worker "api" (env staging)',
    );
  });
});

describe("validSecretName", () => {
  it("applies GitHub's rules to GitHub only", () => {
    expect(validSecretName("github", "API_KEY")).toBe(true);
    expect(validSecretName("github", "my.key")).toBe(false);
    expect(validSecretName("github", "GITHUB_TOKEN")).toBe(false);
    expect(validSecretName("github", "1ABC")).toBe(false);
    expect(validSecretName("cloudflare", "my.key")).toBe(true);
  });
});

describe("readWorkerName", () => {
  it("reads the top-level name from jsonc or toml", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "klef-wrangler-"));
    try {
      expect(readWorkerName(dir)).toBeNull();
      await writeFile(path.join(dir, "wrangler.toml"), 'name = "toml-api"\n[env.staging]\nname = "other"\n');
      expect(readWorkerName(dir)).toBe("toml-api");
      await writeFile(path.join(dir, "wrangler.jsonc"), '{ // c\n "name": "json-api" }');
      expect(readWorkerName(dir)).toBe("json-api");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("drift", () => {
  it("compares GitHub names case-insensitively", () => {
    expect(nameDrift("github", ["api_key", "B"], ["API_KEY", "C"])).toEqual({ missing: ["B"], extra: ["C"] });
    expect(nameDrift("vercel", ["api_key"], ["API_KEY"])).toEqual({ missing: ["api_key"], extra: ["API_KEY"] });
  });

  it("reports values as verdicts only", () => {
    const local = new Map([["A", "1"], ["B", "2"], ["C", "3"]]);
    const drift = vercelValueDrift(local, [
      { name: "A", value: "1" },
      { name: "B", value: "other" },
      { name: "C", value: null },
      { name: "D", value: "x" },
    ]);
    expect(drift).toEqual({ matches: 1, differs: ["B"], unreadable: ["C"] });
    expect(formatDrift({ missing: [], extra: ["D"] }, drift)).toEqual([
      "  only there:    D",
      "  values: 1 matches; differs: B; can't check (Sensitive): C",
    ]);
  });
});
