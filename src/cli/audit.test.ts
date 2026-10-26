import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "./args.ts";
import { groupNames, localFileFor, readWorkerName, SCOPES } from "./audit.ts";
import type { ProjectConfig } from "./project-config.ts";
import { audit } from "./commands/audit.ts";
import { resetUi, setUiMode } from "./ui.ts";

// `klef audit` against fake `vercel`, `gh` and `wrangler` executables on PATH
// (test-fixtures/fake-cli.mjs), so the spawn path is the real one. After every
// test: no value from either side reaches the output.

const SECRET = "sk_live_do_not_print_me";

interface FakeState {
  calls: string[][];
  signedOut?: string[];
  vercel: Record<string, { key: string; value: string; type: string }[]>;
  github: { repo: string[]; envs: Record<string, string[]> };
  cloudflare: string[];
}

let root: string;
let cwd: string;
let env: NodeJS.ProcessEnv;
let statePath: string;
let output: string[];

async function seed(patch: Partial<FakeState> = {}): Promise<void> {
  const base: FakeState = { calls: [], vercel: {}, github: { repo: [], envs: {} }, cloudflare: [] };
  await writeFile(statePath, JSON.stringify({ ...base, ...patch }));
}

async function calls(): Promise<string[][]> {
  return (JSON.parse(await readFile(statePath, "utf8")) as FakeState).calls;
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "klef-audit-"));
  cwd = path.join(root, "app");
  const bin = path.join(root, "bin");
  await mkdir(path.join(cwd, ".vercel"), { recursive: true });
  await mkdir(path.join(cwd, ".git"));
  await mkdir(bin);
  for (const tool of ["vercel", "gh", "wrangler"]) {
    await copyFile(path.join(import.meta.dirname, "test-fixtures", "fake-cli.mjs"), path.join(bin, tool));
    await chmod(path.join(bin, tool), 0o755);
  }
  await writeFile(path.join(cwd, ".vercel", "project.json"), "{}");
  await writeFile(path.join(cwd, "wrangler.jsonc"), '{\n  // api\n  "name": "app-api"\n}\n');
  await writeFile(path.join(cwd, ".env.local"), `API_KEY=${SECRET}_local\nDEBUG=1\n`);
  await writeFile(path.join(cwd, ".env.production"), `# App\nAPI_KEY=${SECRET}_prod\nSENTRY_DSN=${SECRET}_dsn\n`);
  statePath = path.join(root, "fake-state.json");
  await seed();
  env = { PATH: `${bin}${path.delimiter}${process.env.PATH}`, FAKE_STATE: statePath };
  output = [];
  const capture = (...parts: unknown[]) => void output.push(parts.join(" "));
  vi.spyOn(console, "log").mockImplementation(capture);
  vi.spyOn(console, "error").mockImplementation(capture);
});

afterEach(async () => {
  resetUi();
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
  expect(output.join("\n")).not.toContain(SECRET);
  expect(output.join("\n")).not.toContain("leaky");
});

const FULL: Partial<FakeState> = {
  vercel: {
    development: [{ key: "API_KEY", value: `${SECRET}_v`, type: "encrypted" }],
    production: [
      { key: "API_KEY", value: `${SECRET}_v`, type: "encrypted" },
      { key: "OLD_FLAG", value: `${SECRET}_old`, type: "plain" },
      { key: "STRIPE_KEY", value: "", type: "sensitive" },
    ],
  },
  github: { repo: ["API_KEY", "DEPLOY_HOOK"], envs: { production: ["API_KEY", "SENTRY_DSN"] } },
  cloudflare: ["API_KEY"],
};

describe("klef audit", () => {
  it("groups names per platform and environment, never values", async () => {
    await seed(FULL);
    expect(await audit(parseArgs(["audit"]), env, cwd)).toBe(0);
    expect(output).toEqual([
      "Vercel Development  (.env.local)",
      "  only in .env.local: DEBUG",
      "  in both: 1",
      "",
      "Vercel Production  (.env.production)",
      "  only on Vercel: OLD_FLAG, STRIPE_KEY",
      "  only in .env.production: SENTRY_DSN",
      "  in both: 1",
      "",
      'GitHub environment "production" secrets  (.env.production)',
      "  in both: 2",
      "",
      "GitHub repository secrets  (.env.production)",
      "  only on GitHub: DEPLOY_HOOK",
      "  only in .env.production: SENTRY_DSN",
      "  in both: 1",
      "",
      'Cloudflare Worker "app-api"  (.env.production)',
      "  only in .env.production: SENTRY_DSN",
      "  in both: 1",
    ]);
  });

  it("gives an agent the same answer as JSON", async () => {
    await seed(FULL);
    setUiMode({ json: true }, "audit");
    expect(await audit(parseArgs(["audit", "vercel", "--json"]), env, cwd)).toBe(0);
    const envelope = JSON.parse(output.join("\n"));
    expect(envelope).toMatchObject({ schema: 1, ok: true, command: "audit" });
    const { targets } = envelope.data as { targets: Record<string, unknown>[] };
    expect(targets).toEqual([
      {
        platform: "vercel",
        environment: "development",
        label: "Vercel Development",
        file: ".env.local",
        status: "ok",
        reason: null,
        onlyOnPlatform: [],
        onlyLocal: ["DEBUG"],
        both: ["API_KEY"],
      },
      {
        platform: "vercel",
        environment: "production",
        label: "Vercel Production",
        file: ".env.production",
        status: "ok",
        reason: null,
        onlyOnPlatform: ["OLD_FLAG", "STRIPE_KEY"],
        onlyLocal: ["SENTRY_DSN"],
        both: ["API_KEY"],
      },
    ]);
  });

  it("reports a signed-out or missing CLI per platform and carries on", async () => {
    await seed({ ...FULL, signedOut: ["vercel"] });
    const withoutWrangler = path.join(root, "bin-no-wrangler");
    await mkdir(withoutWrangler);
    for (const tool of ["vercel", "gh"]) {
      await copyFile(path.join(root, "bin", tool), path.join(withoutWrangler, tool));
      await chmod(path.join(withoutWrangler, tool), 0o755);
    }
    env.PATH = `${withoutWrangler}${path.delimiter}${path.dirname(process.execPath)}`;

    setUiMode({ json: true }, "audit");
    expect(await audit(parseArgs(["audit", "--json"]), env, cwd)).toBe(0);
    const { targets } = JSON.parse(output.join("\n")).data as {
      targets: { platform: string; status: string; reason: string | null }[];
    };
    expect(targets.map((t) => [t.platform, t.status])).toEqual([
      ["vercel", "unavailable"],
      ["vercel", "unavailable"],
      ["github", "ok"],
      ["github", "ok"],
      ["cloudflare", "unavailable"],
    ]);
    expect(targets[0]!.reason).toBe(
      "`vercel env ls` failed: Error: vercel: not signed in. API_TOKEN=<redacted>",
    );
    expect(targets[4]!.reason).toBe("`wrangler` is not installed, or not on PATH.");
  });

  it("reports a missing GitHub environment instead of failing", async () => {
    await seed({ ...FULL, github: { repo: ["API_KEY"], envs: {} } });
    expect(await audit(parseArgs(["audit", "github"]), env, cwd)).toBe(0);
    expect(output[1]).toBe('  could not check: no GitHub environment "production" in this repository');
    expect(output).toContain("GitHub repository secrets  (.env.production)");
  });

  it("skips platforms that are not set up here, without running them", async () => {
    await rm(path.join(cwd, ".vercel"), { recursive: true });
    await rm(path.join(cwd, "wrangler.jsonc"));
    await seed(FULL);
    expect(await audit(parseArgs(["audit"]), env, cwd)).toBe(0);
    expect(output).toContain(
      "  skipped: not linked here (no .vercel/project.json; run `vercel link`)",
    );
    expect(output).toContain("  skipped: no wrangler.jsonc, wrangler.json or wrangler.toml here");
    expect((await calls()).map((c) => c[0])).toEqual(["gh", "gh"]);
  });

  it("lists what a platform holds when there is no local file", async () => {
    await rm(path.join(cwd, ".env.production"));
    await seed(FULL);
    expect(await audit(parseArgs(["audit", "cloudflare"]), env, cwd)).toBe(0);
    expect(output).toEqual([
      'Cloudflare Worker "app-api"  (.env.production)',
      "  no .env.production here",
      "  only on Cloudflare: API_KEY",
    ]);
  });

  it("reads the local path from .klef.json and audits a preview file when there is one", async () => {
    await mkdir(path.join(cwd, "web"));
    await writeFile(path.join(cwd, "web", ".env.preview"), "PREVIEW_ONLY=1\n");
    await writeFile(
      path.join(cwd, ".klef.json"),
      JSON.stringify({
        workspace: "w",
        project: "p",
        file: ".env.local",
        environment: null,
        files: [{ file: ".env.preview", path: "web/.env.preview" }],
      }),
    );
    await seed({ vercel: { preview: [{ key: "PREVIEW_ONLY", value: "1", type: "plain" }] } });
    expect(await audit(parseArgs(["audit", "vercel"]), env, cwd)).toBe(0);
    expect(output).toContain("Vercel Preview  (web/.env.preview)");
  });

  it("only ever runs listing commands", async () => {
    await seed(FULL);
    await audit(parseArgs(["audit"]), env, cwd);
    for (const call of await calls()) {
      expect(call.slice(1, 3).join(" ")).toMatch(/^(env ls|secret list)$/);
    }
  });

  it("rejects an unknown platform", async () => {
    await expect(audit(parseArgs(["audit", "netlify"]), env, cwd)).rejects.toMatchObject({
      code: "usage",
      message: "Unknown platform \"netlify\". Use one of: vercel, github, cloudflare.",
    });
  });
});

describe("groupNames", () => {
  it("matches GitHub names case-insensitively and the rest exactly", () => {
    expect(groupNames("github", ["api_key", "B"], ["API_KEY", "C"])).toEqual({
      onlyOnPlatform: ["C"],
      onlyLocal: ["B"],
      both: ["api_key"],
    });
    expect(groupNames("vercel", ["api_key"], ["API_KEY"])).toEqual({
      onlyOnPlatform: ["API_KEY"],
      onlyLocal: ["api_key"],
      both: [],
    });
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

describe("localFileFor", () => {
  const vercel = (env: string) => SCOPES.vercel.find((s) => s.environment === env)!;
  const base: ProjectConfig = {
    workspace: "Team",
    project: "web",
    file: ".env.local",
    environment: null,
  };

  it("uses the conventional file without a linked config", () => {
    expect(localFileFor(vercel("production"), null)).toBe(".env.production");
  });

  it("keeps the conventional file when the repo syncs it, at its path", () => {
    const config = {
      ...base,
      files: [
        { file: ".env.production", path: "apps/web/.env.production" },
        { file: ".env", path: ".env" },
      ],
    };
    expect(localFileFor(vercel("production"), config)).toBe(
      "apps/web/.env.production",
    );
  });

  it("finds production in a file whose name implies it", () => {
    const config = {
      ...base,
      files: [{ file: ".env.production.local", path: ".env.production.local" }],
    };
    expect(localFileFor(vercel("production"), config)).toBe(".env.production.local");
  });

  it("finds production in a plain .env explicitly marked production", () => {
    const config = { ...base, file: ".env", environment: "production" };
    expect(localFileFor(vercel("production"), config)).toBe(".env");
    expect(localFileFor(SCOPES.cloudflare[0]!, config)).toBe(".env");
  });

  it("falls back to the conventional name when nothing matches", () => {
    const config = { ...base, file: ".env", environment: null };
    expect(localFileFor(vercel("preview"), config)).toBe(".env.preview");
  });
});
