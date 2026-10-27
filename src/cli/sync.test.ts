import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptBlob, encryptBlob, setupVault, type VaultSetupResult } from "../shared/crypto.ts";
import type { EncryptedBlob } from "../shared/types.ts";
import { parseArgs } from "./args.ts";
import { diff } from "./commands/diff.ts";
import { link } from "./commands/link.ts";
import { pull } from "./commands/pull.ts";
import { restore } from "./commands/restore.ts";
import { sync } from "./commands/sync.ts";
import type { CliError } from "./ui.ts";

// sync, diff, restore and link's defaults end to end against an in-memory API:
// real crypto, real files, fake network. Same shape as sync-all.test.ts, with
// a vault whose files can be created, since sync creates the ones it lacks.

const PASSPHRASE = "correct horse battery staple";
const SECRET = "sk_live_do_not_print_me";
const LOCAL = `# App\nAPI_KEY=${SECRET}_local\nPORT=3000\n`;
const PROD = `# App\nAPI_KEY=${SECRET}_prod\n`;

interface FakeFile {
  environment: string | null;
  versions: EncryptedBlob[];
}

let vault: VaultSetupResult;
let root: string;
let cwd: string;
let env: NodeJS.ProcessEnv;
let files: Map<string, FakeFile>;
let output: string[];

beforeAll(async () => {
  vault = await setupVault(PASSPHRASE);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
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
      workspaces: [
        {
          id: "w",
          name: "Personal",
          icon: null,
          createdAt: "",
          projects: [{ id: "p", name: "lensdrop", framework: null, icon: null, createdAt: "", files: nodes }],
        },
      ],
    });
  }
  if (url.pathname === "/api/files" && init?.method === "POST") {
    const { projectId, name, environment } = JSON.parse(String(init.body)) as {
      projectId: string;
      name: string;
      environment: string | null;
    };
    expect(projectId).toBe("p");
    files.set(name, { environment, versions: [] });
    return json({ id: name, name }, 201);
  }
  const match = url.pathname.match(/^\/api\/files\/([^/]+)\/(current|versions)$/);
  if (match) {
    const file = files.get(decodeURIComponent(match[1]!));
    if (!file) return json({ error: "Not found" }, 404);
    if (match[2] === "current") {
      const blob = file.versions.at(-1);
      return json({ version: blob ? { id: `v${file.versions.length}`, blob, createdAt: "" } : null });
    }
    if (init?.method === "POST") {
      const { blob } = JSON.parse(String(init.body)) as { blob: EncryptedBlob };
      file.versions.push(blob);
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

async function stored(name: string): Promise<string> {
  return decryptBlob(vault.dek, files.get(name)!.versions.at(-1)!);
}

const local = (name: string, dir = cwd) => readFile(path.join(dir, name), "utf8");
const prompt = () => Promise.resolve(PASSPHRASE);
const yes = () => Promise.resolve(true);
const no = () => Promise.resolve(false);

async function writeConfig(dir = cwd): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, ".klef.json"),
    JSON.stringify({
      workspace: "Personal",
      project: "lensdrop",
      file: ".env.local",
      environment: null,
      files: [{ file: ".env.local" }, { file: ".env.production" }],
    }),
  );
}

/** An edit that also moves the mtime, as a real editor's save would. */
async function edit(name: string, text: string): Promise<void> {
  const file = path.join(cwd, name);
  await writeFile(file, text);
  const later = new Date(Date.now() + 5_000);
  await utimes(file, later, later);
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "klef-sync-cmd-"));
  cwd = path.join(root, "lensdrop");
  await mkdir(cwd);
  env = {
    KLEF_TOKEN: "klef_pat_test",
    KLEF_API_URL: "https://klef.test",
    KLEF_AGENT_SOCK: path.join(root, ".agent", "agent.sock"),
    KLEF_CONFIG_DIR: path.join(root, ".config"),
  };
  files = new Map();
  output = [];
  vi.stubGlobal("fetch", fakeFetch);
  const capture = (...parts: unknown[]) => void output.push(parts.join(" "));
  vi.spyOn(console, "log").mockImplementation(capture);
  vi.spyOn(console, "error").mockImplementation(capture);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
  expect(output.join("\n")).not.toContain(SECRET);
});

describe("link", () => {
  it("records .env.local and .env.production when the project has them", async () => {
    await save(".env.local", LOCAL);
    await save(".env.production", PROD);

    expect(await link(parseArgs(["link", "Personal", "lensdrop"]), env, cwd)).toBe(0);

    const config = JSON.parse(await local(".klef.json"));
    expect(config.file).toBe(".env.local");
    expect(config.files).toEqual([
      { file: ".env.local", path: ".env.local" },
      { file: ".env.production", path: ".env.production" },
    ]);
    expect(output).toContain("✓ Linked to Personal / lensdrop");
    expect(output).toContain("  Files   .env.local, .env.production");
  });

  it("records a production file that exists only here", async () => {
    await save(".env.local", LOCAL);
    await writeFile(path.join(cwd, ".env.production"), PROD);

    expect(await link(parseArgs(["link", "Personal", "lensdrop"]), env, cwd)).toBe(0);
    expect(JSON.parse(await local(".klef.json")).files).toHaveLength(2);
  });

  it("writes no list when there is only the one file", async () => {
    await save(".env", "A=1\n");
    expect(await link(parseArgs(["link", "Personal", "lensdrop"]), env, cwd)).toBe(0);
    const config = JSON.parse(await local(".klef.json"));
    expect(config.file).toBe(".env");
    expect(config.files).toBeUndefined();
  });
});

describe("sync", () => {
  beforeEach(async () => {
    await writeConfig();
    await save(".env.local", LOCAL);
    await save(".env.production", PROD);
  });

  it("pulls what is missing, then has nothing to do", async () => {
    expect(await sync(parseArgs(["sync"]), env, cwd, prompt, no)).toBe(0);
    expect(await local(".env.local")).toBe(LOCAL);
    expect(await local(".env.production")).toBe(PROD);
    expect((await stat(path.join(cwd, ".env.production"))).mode & 0o777).toBe(0o600);

    output = [];
    expect(await sync(parseArgs(["sync"]), env, cwd, prompt, no)).toBe(0);
    expect(output).toContain("✓ Everything is in sync");
  });

  it("pushes a local edit after one confirmation", async () => {
    await sync(parseArgs(["sync"]), env, cwd, prompt, no);
    await edit(".env.local", `${LOCAL}NEW=1\n`);

    const questions: string[] = [];
    const ask = (q: string) => (questions.push(q), Promise.resolve(true));
    expect(await sync(parseArgs(["sync"]), env, cwd, prompt, ask)).toBe(0);

    expect(questions).toEqual(["Push?"]);
    expect(await stored(".env.local")).toBe(`${LOCAL}NEW=1\n`);
    expect(files.get(".env.production")!.versions).toHaveLength(1);
  });

  it("pulls a vault change over an untouched file", async () => {
    await sync(parseArgs(["sync"]), env, cwd, prompt, no);
    await save(".env.production", `${PROD}ADDED=1\n`);

    expect(await sync(parseArgs(["sync"]), env, cwd, prompt, no)).toBe(0);
    expect(await local(".env.production")).toBe(`${PROD}ADDED=1\n`);
    expect(output.some((l) => /^\.env\.production\s+changed in the vault$/.test(l))).toBe(true);
  });

  it("stops on a conflict, writes nothing, and shows keys without values", async () => {
    await sync(parseArgs(["sync"]), env, cwd, prompt, no);
    await edit(".env.local", `# App\nAPI_KEY=${SECRET}_mine\nPORT=3000\nMINE=1\n`);
    await save(".env.local", `# App\nAPI_KEY=${SECRET}_theirs\n`);
    await save(".env.production", `${PROD}ADDED=1\n`);

    const failure = await sync(parseArgs(["sync", "-y"]), env, cwd, prompt, yes).catch((err: unknown) => err);
    expect(failure).toMatchObject({ code: "conflict", exitCode: 5 });

    expect(await local(".env.local")).toContain("MINE=1");
    expect(await local(".env.production")).toBe(PROD);
    expect(files.get(".env.local")!.versions).toHaveLength(2);
    expect(output).toEqual(
      expect.arrayContaining([
        "  + MINE     only here",
        "  + PORT     only here",
        "  ~ API_KEY  value differs",
      ]),
    );
    expect((failure as CliError).next).toEqual([
      { command: "klef sync --merge --dry-run", description: "see what a key-by-key merge would do" },
      { command: "klef pull --file .env.local", description: "take the vault's .env.local" },
      { command: "klef push --file .env.local", description: "keep this .env.local" },
    ]);
    expect(JSON.stringify((failure as CliError).data)).not.toContain(SECRET);
  });

  it("treats a differing file this machine never synced as a conflict", async () => {
    await writeFile(path.join(cwd, ".env.local"), "PORT=1\n");
    await expect(sync(parseArgs(["sync"]), env, cwd, prompt, yes)).rejects.toMatchObject({ code: "conflict" });
    expect(await local(".env.local")).toBe("PORT=1\n");
    expect(output.join("\n")).toContain("never been synced on this machine");
  });

  it("settles that conflict once one side is chosen", async () => {
    await writeFile(path.join(cwd, ".env.local"), "PORT=1\n");
    expect(await pull(parseArgs(["pull", "--file", ".env.local"]), env, cwd, prompt)).toBe(0);
    expect(await sync(parseArgs(["sync"]), env, cwd, prompt, no)).toBe(0);
    expect(await local(".env.local")).toBe(LOCAL);
  });

  it("creates a vault file it lacks, labelled by its name", async () => {
    files.delete(".env.production");
    await sync(parseArgs(["sync"]), env, cwd, prompt, no);
    await writeFile(path.join(cwd, ".env.production"), PROD);

    expect(await sync(parseArgs(["sync", "-y"]), env, cwd, prompt, no)).toBe(0);
    expect(files.get(".env.production")?.environment).toBe("production");
    expect(await stored(".env.production")).toBe(PROD);
  });

  it("still pulls when the push is declined", async () => {
    await sync(parseArgs(["sync"]), env, cwd, prompt, no);
    await edit(".env.local", `${LOCAL}NEW=1\n`);
    await save(".env.production", `${PROD}ADDED=1\n`);

    expect(await sync(parseArgs(["sync"]), env, cwd, prompt, no)).toBe(1);
    expect(await local(".env.production")).toBe(`${PROD}ADDED=1\n`);
    expect(files.get(".env.local")!.versions).toHaveLength(1);
    expect(output).toContain("Nothing pushed.");
  });

  it("writes nothing on --dry-run", async () => {
    expect(await sync(parseArgs(["sync", "--dry-run"]), env, cwd, prompt, yes)).toBe(0);
    await expect(stat(path.join(cwd, ".env.local"))).rejects.toThrow();
    expect(output).toContain("Dry run: nothing written.");
  });
});

describe("diff", () => {
  it("names the keys that differ and writes nothing", async () => {
    await writeConfig();
    await save(".env.local", LOCAL);
    await save(".env.production", PROD);
    await writeFile(path.join(cwd, ".env.local"), `API_KEY=${SECRET}_changed\nPORT=3000\n`);

    expect(await diff(parseArgs(["diff", "--all"]), env, cwd, prompt)).toBe(0);
    expect(output).toEqual([
      ".env.local  differs from the vault and has never been synced on this machine",
      "  ~ API_KEY  value differs",
      ".env.production  missing here",
    ]);
    await expect(stat(path.join(cwd, ".env.production"))).rejects.toThrow();
  });
});

describe("restore", () => {
  beforeEach(async () => {
    await save(".env.local", LOCAL);
    await save(".env.production", PROD);
  });

  it("lists every linked checkout, then pulls each one's files", async () => {
    const other = path.join(root, "org", "lensdrop-copy");
    await writeConfig();
    await writeConfig(other);

    const questions: string[] = [];
    const ask = (q: string) => (questions.push(q), Promise.resolve(true));
    expect(await restore(parseArgs(["restore", root]), env, cwd, prompt, ask)).toBe(0);

    expect(questions).toEqual(["Restore these 2?"]);
    expect(output).toContain("  lensdrop           Personal / lensdrop  .env.local, .env.production");
    expect(await local(".env.production")).toBe(PROD);
    expect(await local(".env.local", other)).toBe(LOCAL);
  });

  it("decrypts nothing when declined", async () => {
    await writeConfig();
    const fetchSpy = vi.fn(fakeFetch);
    vi.stubGlobal("fetch", fetchSpy);
    expect(await restore(parseArgs(["restore", root]), env, cwd, prompt, no)).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(stat(path.join(cwd, ".env.local"))).rejects.toThrow();
  });

  it("pulls but never pushes, and points at sync for the rest", async () => {
    await writeConfig();
    await writeFile(path.join(cwd, ".env.local"), "PORT=1\n");

    const failure = await restore(parseArgs(["restore", root, "-y"]), env, cwd, prompt, no).catch((e: unknown) => e);
    expect(failure).toMatchObject({ code: "conflict", next: [{ command: "klef sync -C ." }] });
    expect(await local(".env.local")).toBe("PORT=1\n");
    expect(await local(".env.production")).toBe(PROD);
    expect(files.get(".env.local")!.versions).toHaveLength(1);
  });

  it("says so when there is nothing linked", async () => {
    await expect(restore(parseArgs(["restore", root]), env, cwd, prompt, yes)).rejects.toMatchObject({
      code: "not_linked",
      message: expect.stringMatching(/^No linked checkouts under /),
    });
  });
});
