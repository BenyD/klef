import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptBlob, encryptBlob, setupVault, type VaultSetupResult } from "../shared/crypto.ts";
import type { EncryptedBlob } from "../shared/types.ts";
import { parseArgs } from "./args.ts";
import { push } from "./commands/push.ts";
import { status } from "./commands/status.ts";
import { importFrom } from "./commands/import.ts";

// push --to, status --targets and import --from, end to end: real crypto, a
// fake Klef API, and fake `vercel`, `gh` and `wrangler` executables on PATH
// (test-fixtures/fake-cli.mjs), so the spawn, stdin and temp-file paths are
// the real ones. After every test: no value in klef's output, and no value
// in any argv a tool was given.

const PASSPHRASE = "correct horse battery staple";
const SECRET = "sk_live_do_not_print_me";

const PROD = [
  "# App",
  `API_KEY=${SECRET}_prod`,
  `QUOTED="${SECRET}_quoted # not a comment"`,
  "PORT=3000 # inline comment",
  "EMPTY=",
  `my.dotted=${SECRET}_dotted`,
  "",
].join("\n");
const LOCAL = `API_KEY=${SECRET}_local\nDEBUG=1\n`;

interface FakeState {
  calls: string[][];
  pulledFiles: string[];
  vercel: Record<string, { key: string; value: string; type: string }[]>;
  github: { repo: Record<string, string>; envs: Record<string, Record<string, string>> };
  cloudflare: Record<string, Record<string, string>>;
}

let vault: VaultSetupResult;
let root: string;
let cwd: string;
let env: NodeJS.ProcessEnv;
let files: Map<string, { environment: string | null; versions: EncryptedBlob[] }>;
let output: string[];
let statePath: string;

beforeAll(async () => {
  vault = await setupVault(PASSPHRASE);
});

function json(body: unknown, statusCode = 200): Response {
  return new Response(JSON.stringify(body), { status: statusCode, headers: { "content-type": "application/json" } });
}

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input.toString());
  if (url.pathname === "/api/vault") return json({ exists: true, keyMaterial: vault.keyMaterial });
  if (url.pathname === "/api/tree") {
    const nodes = [...files].map(([name, f]) => ({
      id: name,
      name,
      currentVersionId: f.versions.length ? `v${f.versions.length}` : null,
      environment: f.environment,
      createdAt: "",
    }));
    return json({
      workspaces: [{ id: "w", name: "Personal", icon: null, createdAt: "", projects: [
        { id: "p", name: "lensdrop", framework: null, icon: null, createdAt: "", files: nodes },
      ] }],
    });
  }
  if (url.pathname === "/api/files" && init?.method === "POST") {
    const { name, environment } = JSON.parse(String(init.body)) as { name: string; environment: string | null };
    files.set(name, { environment, versions: [] });
    return json({ id: name, name }, 201);
  }
  const match = url.pathname.match(/^\/api\/files\/([^/]+)\/(current|versions)$/);
  if (match) {
    const file = files.get(decodeURIComponent(match[1]!))!;
    if (match[2] === "current") {
      const blob = file.versions.at(-1);
      return json({ version: blob ? { id: `v${file.versions.length}`, blob, createdAt: "" } : null });
    }
    if (init?.method === "POST") {
      file.versions.push((JSON.parse(String(init.body)) as { blob: EncryptedBlob }).blob);
      return json({ id: `v${file.versions.length}`, createdAt: "" });
    }
  }
  return new Response("not found", { status: 404 });
}

async function save(name: string, text: string): Promise<void> {
  const file = files.get(name) ?? { environment: null, versions: [] };
  file.versions.push(await encryptBlob(vault.dek, text));
  files.set(name, file);
}

async function state(): Promise<FakeState> {
  return JSON.parse(await readFile(statePath, "utf8")) as FakeState;
}

async function seedState(patch: Partial<FakeState>): Promise<void> {
  const base: FakeState = {
    calls: [],
    pulledFiles: [],
    vercel: {},
    github: { repo: {}, envs: {} },
    cloudflare: {},
  };
  await writeFile(statePath, JSON.stringify({ ...base, ...patch }));
}

const prompt = () => Promise.resolve(PASSPHRASE);
const yes = () => Promise.resolve(true);
const no = () => Promise.resolve(false);

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "klef-deploy-"));
  cwd = path.join(root, "lensdrop");
  const bin = path.join(root, "bin");
  await mkdir(path.join(cwd, ".vercel"), { recursive: true });
  await mkdir(path.join(cwd, ".git"));
  await mkdir(bin);
  for (const tool of ["vercel", "gh", "wrangler"]) {
    await copyFile(path.join(import.meta.dirname, "test-fixtures", "fake-cli.mjs"), path.join(bin, tool));
    await chmod(path.join(bin, tool), 0o755);
  }
  await writeFile(path.join(cwd, ".vercel", "project.json"), "{}");
  await writeFile(path.join(cwd, "wrangler.jsonc"), '{\n  // api\n  "name": "lensdrop-api"\n}\n');
  await writeFile(
    path.join(cwd, ".klef.json"),
    JSON.stringify({
      workspace: "Personal",
      project: "lensdrop",
      file: ".env.local",
      environment: null,
      files: [{ file: ".env.local" }, { file: ".env.production" }],
    }),
  );
  statePath = path.join(root, "fake-state.json");
  await seedState({});
  env = {
    KLEF_TOKEN: "klef_pat_test",
    KLEF_API_URL: "https://klef.test",
    KLEF_AGENT_SOCK: path.join(root, ".agent", "agent.sock"),
    KLEF_CONFIG_DIR: path.join(root, ".config"),
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    FAKE_STATE: statePath,
  };
  files = new Map();
  await save(".env.production", PROD);
  await save(".env.local", LOCAL);
  output = [];
  vi.stubGlobal("fetch", fakeFetch);
  const capture = (...parts: unknown[]) => void output.push(parts.join(" "));
  vi.spyOn(console, "log").mockImplementation(capture);
  vi.spyOn(console, "error").mockImplementation(capture);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  const { calls } = await state();
  await rm(root, { recursive: true, force: true });
  expect(output.join("\n")).not.toContain(SECRET);
  expect(JSON.stringify(calls)).not.toContain(SECRET);
});

describe("push --to vercel", () => {
  it("sends each file to its environment, decoded, on stdin", async () => {
    await seedState({ vercel: { production: [{ key: "OLD_ONLY_THERE", value: "x", type: "encrypted" }] } });

    expect(await push(parseArgs(["push", "--to", "vercel"]), env, cwd, prompt, yes)).toBe(0);

    const { vercel } = await state();
    const prod = Object.fromEntries(vercel.production!.map((v) => [v.key, v.value]));
    expect(prod).toEqual({
      OLD_ONLY_THERE: "x",
      API_KEY: `${SECRET}_prod`,
      QUOTED: `${SECRET}_quoted # not a comment`,
      PORT: "3000",
      "my.dotted": `${SECRET}_dotted`,
    });
    expect(vercel.development!.map((v) => v.key)).toEqual(["API_KEY", "DEBUG"]);
    expect(output).toContain("  Left alone, only on Vercel Production: OLD_ONLY_THERE");
    expect(output).toContain("  Skipped, empty in Klef: EMPTY");
    expect(output).toContain("Set 4 variables on Vercel Production.");
    expect(output).toContain("Set 2 variables on Vercel Development.");
  });

  it("sends nothing when declined", async () => {
    expect(await push(parseArgs(["push", "--to", "vercel"]), env, cwd, prompt, no)).toBe(1);
    expect((await state()).calls.filter((c) => c[2] === "add")).toEqual([]);
  });

  it("stops when the local file differs from the vault", async () => {
    await writeFile(path.join(cwd, ".env.production"), "API_KEY=edited\n");
    await expect(push(parseArgs(["push", "--to", "vercel", "-y"]), env, cwd, prompt, yes)).rejects.toThrow(
      /differs from the vault/,
    );
    expect((await state()).calls).toEqual([]);
  });

  it("scrubs a value a failing tool echoes back", async () => {
    await save(".env.production", `FAIL_ME=${SECRET}_echoed\n`);
    await expect(
      push(parseArgs(["push", "--to", "vercel", "--file", ".env.production", "-y"]), env, cwd, prompt, yes),
    ).rejects.toThrow(/`vercel env add` failed: .*<redacted>/);
  });
});

describe("push --to github", () => {
  it("sends the production file to repository secrets by default", async () => {
    expect(await push(parseArgs(["push", "--to", "github", "-y"]), env, cwd, prompt, no)).toBe(0);
    const { github } = await state();
    expect(github.repo).toEqual({
      API_KEY: `${SECRET}_prod`,
      QUOTED: `${SECRET}_quoted # not a comment`,
      PORT: "3000",
    });
    expect(output).toContain("  Skipped, names GitHub does not accept: my.dotted");
  });

  it("sends to a deployment environment with --env", async () => {
    expect(await push(parseArgs(["push", "--to", "github", "--env", "production", "-y"]), env, cwd, prompt, no)).toBe(0);
    expect(Object.keys((await state()).github.envs.production!)).toHaveLength(3);
  });

  it("refuses --all, since one scope holds one file", async () => {
    await expect(push(parseArgs(["push", "--to", "github", "--all"]), env, cwd, prompt, yes)).rejects.toThrow(
      /takes one file/,
    );
  });
});

describe("push --to cloudflare", () => {
  it("sends the production file in one bulk call, as JSON on stdin", async () => {
    expect(await push(parseArgs(["push", "--to", "cloudflare", "-y"]), env, cwd, prompt, no)).toBe(0);
    const { cloudflare, calls } = await state();
    expect(cloudflare["config|"]).toMatchObject({ API_KEY: `${SECRET}_prod`, "my.dotted": `${SECRET}_dotted` });
    expect(calls.filter((c) => c[0] === "wrangler" && c[2] === "bulk")).toEqual([["wrangler", "secret", "bulk"]]);
    expect(output[0]).toMatch(/on Cloudflare Worker "lensdrop-api" from \.env\.production/);
  });

  it("passes --name and --env through", async () => {
    const args = ["push", "--to", "cloudflare", "--name", "api", "--env", "staging", "-y"];
    expect(await push(parseArgs(args), env, cwd, prompt, no)).toBe(0);
    expect(Object.keys((await state()).cloudflare["api|staging"]!)).toContain("API_KEY");
  });

  it("will not guess a Worker for a non-production file", async () => {
    await expect(
      push(parseArgs(["push", "--to", "cloudflare", "--file", ".env.local"]), env, cwd, prompt, yes),
    ).rejects.toThrow(/--env or --name/);
  });
});

describe("status --targets", () => {
  it("reports name drift everywhere and value drift on Vercel, without values", async () => {
    await seedState({
      vercel: {
        production: [
          { key: "API_KEY", value: `${SECRET}_prod`, type: "encrypted" },
          { key: "QUOTED", value: `${SECRET}_stale`, type: "encrypted" },
          { key: "PORT", value: "3000", type: "sensitive" },
          { key: "ONLY_VERCEL", value: "x", type: "plain" },
        ],
        development: [
          { key: "API_KEY", value: `${SECRET}_local`, type: "encrypted" },
          { key: "DEBUG", value: "1", type: "plain" },
        ],
      },
      github: { repo: { API_KEY: "s" }, envs: {} },
      cloudflare: { "config|": { API_KEY: "s", PORT: "1", QUOTED: "q", EMPTY: "", "my.dotted": "d", EXTRA: "e" } },
    });

    expect(await status(parseArgs(["status", "--targets"]), env, cwd, prompt)).toBe(0);

    expect(output).toEqual([
      "Vercel Development  (.env.local)",
      "  names match",
      "  values: 2 match",
      "Vercel Production  (.env.production)",
      "  missing there: EMPTY, my.dotted",
      "  only there:    ONLY_VERCEL",
      "  values: 1 matches; differs: QUOTED; can't check (Sensitive): PORT",
      "GitHub repository secrets  (.env.production)",
      "  missing there: EMPTY, my.dotted, PORT, QUOTED",
      "Cloudflare Worker \"lensdrop-api\"  (.env.production)",
      "  only there:    EXTRA",
    ]);
    const { pulledFiles } = await state();
    expect(pulledFiles).toHaveLength(2);
    for (const file of pulledFiles) await expect(stat(file)).rejects.toThrow();
  });

  it("checks one target with --to", async () => {
    expect(await status(parseArgs(["status", "--targets", "--to", "github"]), env, cwd, prompt)).toBe(0);
    expect(output[0]).toBe("GitHub repository secrets  (.env.production)");
  });
});

describe("import --from vercel", () => {
  const vercelProd = {
    production: [
      { key: "B_FIRST", value: `${SECRET}_b`, type: "encrypted" },
      { key: "A_SECOND", value: `it's "${SECRET}"\nline two`, type: "plain" },
      { key: "HIDDEN", value: "", type: "sensitive" },
    ],
    preview: [{ key: "P", value: "1", type: "plain" }],
  };

  it("creates a Klef file in Vercel's order, encrypted here, naming what it could not read", async () => {
    await seedState({ vercel: vercelProd });
    const args = ["import", "--from", "vercel", "--env", "preview"];
    expect(await importFrom(parseArgs(args), env, cwd, prompt, yes)).toBe(0);
    expect(files.get(".env.preview")?.environment).toBe("preview");

    files.delete(".env.production");
    expect(await importFrom(parseArgs(["import", "--from", "vercel", "-y"]), env, cwd, prompt, no)).toBe(0);
    const text = await decryptBlob(vault.dek, files.get(".env.production")!.versions[0]!);
    expect(text).toBe(`B_FIRST=${SECRET}_b\nA_SECOND="it's \\"${SECRET}\\"\\nline two"\n`);
    expect(files.get(".env.production")?.environment).toBe("production");
    expect(output).toContain("  Sensitive on Vercel, so not readable: HIDDEN");
    expect(output).toContain("Add this one by hand: HIDDEN");
    for (const file of (await state()).pulledFiles) await expect(stat(file)).rejects.toThrow();
  });

  it("refuses to replace a saved file without --force", async () => {
    await seedState({ vercel: vercelProd });
    expect(await importFrom(parseArgs(["import", "--from", "vercel", "-y"]), env, cwd, prompt, yes)).toBe(1);
    expect(files.get(".env.production")!.versions).toHaveLength(1);
    expect((await state()).calls).toEqual([]);
  });

  it("asks before replacing with --force, even under -y", async () => {
    await seedState({ vercel: vercelProd });
    const questions: string[] = [];
    const ask = (q: string) => (questions.push(q), Promise.resolve(false));
    expect(await importFrom(parseArgs(["import", "--from", "vercel", "--force", "-y"]), env, cwd, prompt, ask)).toBe(1);
    expect(questions).toEqual(["Replace it?"]);
    expect(files.get(".env.production")!.versions).toHaveLength(1);

    expect(await importFrom(parseArgs(["import", "--from", "vercel", "--force"]), env, cwd, prompt, yes)).toBe(0);
    expect(files.get(".env.production")!.versions).toHaveLength(2);
  });

  it("refuses targets that cannot be read back", async () => {
    await expect(importFrom(parseArgs(["import", "--from", "github"]), env, cwd, prompt, yes)).rejects.toThrow(
      /cannot be read back/,
    );
  });
});
