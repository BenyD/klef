import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findWorkers } from "./audit.ts";
import { collectAudit, summarizeAudit, type AuditEntry } from "./commands/audit.ts";
import { referencedSecrets } from "./workflow-secrets.ts";

// audit (A) GitHub against workflows, (B) unused environments and the
// "audit" map, (C) every Worker in the repo; against fake vercel, gh and
// wrangler on PATH (test-fixtures/fake-cli.mjs).

let root: string;
let cwd: string;
let env: NodeJS.ProcessEnv;
let statePath: string;

async function put(rel: string, text = "") {
  await mkdir(path.dirname(path.join(cwd, rel)), { recursive: true });
  await writeFile(path.join(cwd, rel), text);
}

async function seed(state: Record<string, unknown>) {
  await writeFile(statePath, JSON.stringify({ calls: [], vercel: {}, github: { repo: [], envs: {} }, cloudflare: [], ...state }));
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "klef-audit2-"));
  cwd = path.join(root, "app");
  const bin = path.join(root, "bin");
  await mkdir(path.join(cwd, ".git"), { recursive: true });
  await mkdir(bin);
  for (const tool of ["vercel", "gh", "wrangler"]) {
    await copyFile(path.join(import.meta.dirname, "test-fixtures", "fake-cli.mjs"), path.join(bin, tool));
    await chmod(path.join(bin, tool), 0o755);
  }
  statePath = path.join(root, "state.json");
  await seed({});
  env = { PATH: `${bin}${path.delimiter}${process.env.PATH}`, FAKE_STATE: statePath };
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

const byLabel = (entries: AuditEntry[], label: string) => entries.find((e) => e.label === label)!;

describe("(A) GitHub against what the workflows reference", () => {
  it("finds secrets.NAME and secrets['NAME'], and the environments jobs use", () => {
    const yaml = [
      "jobs:",
      "  deploy:",
      "    environment: production",
      "    steps:",
      "      - run: echo ${{ secrets.STRIPE_KEY }} ${{ secrets['SENTRY_DSN'] }} ${{ secrets.GITHUB_TOKEN }}",
      "  preview:",
      "    environment:",
      "      name: preview",
      "    env: { DB: ${{ secrets.database_url }} }",
    ].join("\n");
    expect(referencedSecrets(yaml)).toEqual({ secrets: ["DATABASE_URL", "SENTRY_DSN", "STRIPE_KEY"], environments: ["preview", "production"] });
  });

  it("reports referenced-but-not-set and set-but-never-referenced, not all of .env.production", async () => {
    await put(".github/workflows/deploy.yml", "jobs:\n  d:\n    environment: production\n    steps:\n      - run: ${{ secrets.STRIPE_KEY }} ${{ secrets.DATABASE_URL }} ${{ secrets.SENTRY_DSN }}\n");
    await put(".env.production", Array.from({ length: 40 }, (_, i) => `NOISE_${i}=x\n`).join(""));
    await seed({ github: { repo: ["STRIPE_KEY", "OLD_TOKEN"], envs: { production: ["DATABASE_URL"] } } });

    const [entry] = await collectAudit(["github"], cwd, env);
    expect(entry).toMatchObject({
      label: "GitHub Actions secrets",
      file: ".github/workflows",
      compareTo: "workflows",
      status: "ok",
      onlyLocal: ["SENTRY_DSN"],
      onlyOnPlatform: ["OLD_TOKEN"],
      both: ["DATABASE_URL", "STRIPE_KEY"],
    });
    expect(summarizeAudit([entry!])).toEqual(["GitHub Actions secrets: 1 referenced, not set, 1 never referenced"]);
  });

  it("notes an environment the workflows name that GitHub does not have", async () => {
    await put(".github/workflows/ci.yml", "jobs:\n  t:\n    environment: staging\n    steps:\n      - run: ${{ secrets.TOKEN }}\n");
    await seed({ github: { repo: ["TOKEN"], envs: {} } });
    const [entry] = await collectAudit(["github"], cwd, env);
    expect(entry).toMatchObject({ status: "ok", onlyLocal: [], reason: 'no GitHub environment "staging" in this repository' });
  });

  it("falls back to .env.production without workflows", async () => {
    await put(".env.production", "A=1\n");
    const entries = await collectAudit(["github"], cwd, env);
    expect(entries.map((e) => e.label)).toEqual(['GitHub environment "production" secrets', "GitHub repository secrets"]);
  });
});

describe("(B) unused environments and the audit map", () => {
  beforeEach(async () => {
    await put(".vercel/project.json", "{}");
  });

  it("shows an environment with nothing set as one line, not every local name", async () => {
    await put(".env.local", "A=1\nB=2\n");
    await seed({ vercel: { development: [] } });
    const entry = byLabel(await collectAudit(["vercel"], cwd, env), "Vercel Development");
    expect(entry).toMatchObject({ status: "empty", onlyLocal: [], onlyOnPlatform: [] });
    expect(summarizeAudit([entry])).toEqual(["Vercel Development: unused environment"]);
  });

  it("compares a scope with the file .klef.json maps it to", async () => {
    await put(".klef.json", JSON.stringify({ workspace: "w", project: "p", file: ".env.local", environment: null, audit: { "vercel:preview": "apps/web/.env.preview" } }));
    await put("apps/web/.env.preview", "P=1\n");
    await seed({ vercel: { preview: [{ key: "P", value: "1", type: "plain" }] } });
    const entry = byLabel(await collectAudit(["vercel"], cwd, env), "Vercel Preview");
    expect(entry).toMatchObject({ file: "apps/web/.env.preview", status: "ok", both: ["P"] });
  });
});

describe("(C) every Worker in the repository", () => {
  it("finds nested wrangler configs and audits each against its own file", async () => {
    await put("wrangler.jsonc", '{ "name": "app" }');
    await put(".env.production", "ROOT_SECRET=1\n");
    await put("workers/image/wrangler.toml", 'name = "image"\n');
    await put("workers/image/.dev.vars", "IMAGE_KEY=1\nEXTRA=2\n");
    await put("containers/ai/wrangler.json", '{ "name": "ai" }');
    await put("node_modules/x/wrangler.json", "{}");
    expect(await findWorkers(cwd)).toEqual([".", "containers/ai", "workers/image"]);

    await seed({ cloudflare: { app: ["ROOT_SECRET"], image: ["IMAGE_KEY", "OLD"], ai: [] } });
    const entries = await collectAudit(["cloudflare"], cwd, env);
    expect(entries.map((e) => [e.label, e.file, e.status])).toEqual([
      ['Cloudflare Worker "app"', ".env.production", "ok"],
      ['Cloudflare Worker "ai" (containers/ai)', ".env.production", "empty"],
      ['Cloudflare Worker "image" (workers/image)', "workers/image/.dev.vars", "ok"],
    ]);
    expect(entries[2]).toMatchObject({ onlyOnPlatform: ["OLD"], onlyLocal: ["EXTRA"], both: ["IMAGE_KEY"] });
    // Each Worker's listing ran in its own directory.
    const calls = (JSON.parse(await readFile(statePath, "utf8")) as { calls: string[][] }).calls;
    expect(calls.filter((c) => c[0] === "wrangler")).toHaveLength(3);
  });
});
