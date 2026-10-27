import { mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptBlob, encryptBlob, setupVault, type VaultSetupResult } from "../shared/crypto.ts";
import type { EncryptedBlob } from "../shared/types.ts";
import { parseArgs } from "./args.ts";
import { list } from "./commands/list.ts";
import { recover } from "./commands/recover.ts";
import { set } from "./commands/set.ts";
import { sync } from "./commands/sync.ts";
import { NoTerminalError } from "./prompt.ts";
import { resetUi, setUiMode, type CliError } from "./ui.ts";

// sync --merge, set and recover end to end: real crypto, real files, a fake
// API that keeps every version (as the real one does).

const PASSPHRASE = "correct horse battery staple";
const SECRET = "sk_live_do_not_print_me";

let vault: VaultSetupResult;
let cwd: string;
let env: NodeJS.ProcessEnv;
let versions: { id: string; blob: EncryptedBlob; createdAt: string }[];
let output: string[];
let n: number;

beforeAll(async () => {
  vault = await setupVault(PASSPHRASE);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input.toString());
  const p = url.pathname;
  if (p === "/api/vault") return json({ exists: true, keyMaterial: vault.keyMaterial });
  if (p === "/api/tree") {
    const files = [{ id: "f", name: ".env.local", currentVersionId: versions.at(-1)?.id ?? null, environment: null, createdAt: "" }];
    return json({ workspaces: [{ id: "w", name: "Personal", icon: null, createdAt: "", projects: [{ id: "p", name: "lensdrop", framework: null, icon: null, createdAt: "", files }] }] });
  }
  if (p === "/api/files/f/current") return json({ version: versions.at(-1) ?? null });
  if (p === "/api/files/f/versions" && init?.method === "POST") {
    const { blob } = JSON.parse(String(init.body)) as { blob: EncryptedBlob };
    versions.push({ id: `${(++n).toString(16).padStart(8, "0")}aa`, blob, createdAt: `2026-10-27T10:0${n}:00Z` });
    return json({ id: versions.at(-1)!.id, createdAt: "" });
  }
  if (p === "/api/files/f/versions") {
    return json({ versions: [...versions].reverse().map((v, i) => ({ id: v.id, createdAt: v.createdAt, isCurrent: i === 0 })) });
  }
  const m = p.match(/^\/api\/files\/f\/versions\/(.+)$/);
  if (m) {
    const v = versions.find((x) => x.id === m[1]);
    return v ? json({ version: v }) : json({ error: "Not found" }, 404);
  }
  return new Response("not found", { status: 404 });
}

async function save(text: string): Promise<void> {
  versions.push({ id: `${(++n).toString(16).padStart(8, "0")}aa`, blob: await encryptBlob(vault.dek, text), createdAt: `2026-10-27T10:0${n}:00Z` });
}
const stored = async () => decryptBlob(vault.dek, versions.at(-1)!.blob);
const local = () => readFile(path.join(cwd, ".env.local"), "utf8");
const prompt = () => Promise.resolve(PASSPHRASE);
const yes = () => Promise.resolve(true);
async function edit(text: string): Promise<void> {
  const file = path.join(cwd, ".env.local");
  await writeFile(file, text);
  const later = new Date(Date.now() + 5_000 + n * 1000);
  await utimes(file, later, later);
}

beforeEach(async () => {
  cwd = await mkdtemp(path.join(tmpdir(), "klef-merge-"));
  env = {
    KLEF_TOKEN: "klef_pat_test",
    KLEF_API_URL: "https://klef.test",
    KLEF_CONFIG_DIR: path.join(cwd, ".config"),
    KLEF_AGENT_SOCK: path.join(cwd, ".agent.sock"),
    KLEF_NO_KEYCHAIN: "1",
  };
  versions = [];
  n = 0;
  output = [];
  await writeFile(path.join(cwd, ".klef.json"), JSON.stringify({ workspace: "Personal", project: "lensdrop", file: ".env.local", environment: null }));
  vi.stubGlobal("fetch", fakeFetch);
  const capture = (...parts: unknown[]) => void output.push(parts.join(" "));
  vi.spyOn(console, "log").mockImplementation(capture);
  vi.spyOn(console, "error").mockImplementation(capture);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetUi();
  await rm(cwd, { recursive: true, force: true });
  expect(output.join("\n")).not.toContain(SECRET);
});

describe("sync --merge", () => {
  it("on a first sync, gives each side the other's keys instead of a conflict", async () => {
    await save(`SHARED=1\nPROBE_GALLERY_ID=${SECRET}_g\n`);
    await writeFile(path.join(cwd, ".env.local"), `# App\nSHARED=1\nLOCAL_ONLY=${SECRET}_l\n`);

    await expect(sync(parseArgs(["sync"]), env, cwd, prompt, yes)).rejects.toMatchObject({ code: "conflict" });
    expect(await sync(parseArgs(["sync", "--merge", "-y"]), env, cwd, prompt, yes)).toBe(0);

    expect(await local()).toBe(`# App\nSHARED=1\nLOCAL_ONLY=${SECRET}_l\nPROBE_GALLERY_ID=${SECRET}_g\n`);
    expect(await stored()).toBe(await local());
    expect(output).toEqual(expect.arrayContaining([
      "  + PROBE_GALLERY_ID  to here, from the vault",
      "  + LOCAL_ONLY        to the vault, from here",
    ]));
    // Now in step: a plain sync has nothing to do.
    output = [];
    expect(await sync(parseArgs(["sync"]), env, cwd, prompt, yes)).toBe(0);
    expect(output).toContain("✓ Everything is in sync");
  });

  it("lists what each side gains on --dry-run, and writes nothing", async () => {
    await save("A=1\nV=2\n");
    await writeFile(path.join(cwd, ".env.local"), "A=1\nL=3\n");
    setUiMode({ json: true }, "sync");
    expect(await sync(parseArgs(["sync", "--merge", "--dry-run", "--json"]), env, cwd, prompt, yes)).toBe(0);
    const { data } = JSON.parse(output.join("\n"));
    expect(data.files[0]).toMatchObject({ action: "merge", merge: { fromVault: ["V"], fromLocal: ["L"], conflicts: [], base: "none" } });
    expect(await local()).toBe("A=1\nL=3\n");
    expect(versions).toHaveLength(1);
  });

  it("stops only on keys whose values differ, naming them and how to settle each", async () => {
    await save(`A=1\nKEY=${SECRET}_vault\nV=2\n`);
    await writeFile(path.join(cwd, ".env.local"), `A=1\nKEY=${SECRET}_here\nL=3\n`);
    const err = (await sync(parseArgs(["sync", "--merge", "-y"]), env, cwd, prompt, yes).catch((e) => e)) as CliError;
    expect(err.code).toBe("conflict");
    expect(err.next).toContainEqual({ command: "klef set KEY --file .env.local", description: "settle KEY here, then sync --merge again" });
    expect(output).toContain("  ~ KEY");
    expect(output).toEqual(expect.arrayContaining(["  + V  to here, from the vault", "  + L  to the vault, from here"]));
    expect(versions).toHaveLength(1);
  });

  it("after the first sync, never brings back a key deleted on one side", async () => {
    await save("A=1\nB=2\nC=3\n");
    expect(await sync(parseArgs(["sync"]), env, cwd, prompt, yes)).toBe(0); // pulls; records the base
    await edit("A=1\nB=2\n"); // C deleted here
    await save("A=1\nB=2\nC=3\nD=4\n"); // D added in the vault
    expect(await sync(parseArgs(["sync", "--merge", "-y"]), env, cwd, prompt, yes)).toBe(0);
    expect(await local()).toBe("A=1\nB=2\nD=4\n");
    expect(await stored()).toBe("A=1\nB=2\nD=4\n");
    expect(output).toEqual(expect.arrayContaining(["  - C  removed in the vault (deleted here)"]));
  });
});

describe("klef set", () => {
  it("sets one key from the hidden prompt, editing only its line", async () => {
    await writeFile(path.join(cwd, ".env.local"), "# App\nA=1\nKEY=old # note\n");
    const asked: string[] = [];
    const typed = (q: string) => (asked.push(q), Promise.resolve(`${SECRET} with spaces`));
    expect(await set(parseArgs(["set", "KEY"]), env, cwd, typed)).toBe(0);
    expect(asked).toEqual(["Value for KEY (not shown): "]);
    expect(await local()).toBe(`# App\nA=1\nKEY='${SECRET} with spaces'\n`);
    expect(output).toEqual(["✓ set KEY in .env.local", "klef push or klef sync saves it to the vault."]);
  });

  it("adds a new key, and creates the file owner-only", async () => {
    expect(await set(parseArgs(["set", "NEW"]), env, cwd, () => Promise.resolve("v"))).toBe(0);
    expect(await local()).toBe("NEW=v\n");
    expect((await stat(path.join(cwd, ".env.local"))).mode & 0o777).toBe(0o600);
  });

  it("refuses a value on the command line, a bad name, and no terminal", async () => {
    await expect(set(parseArgs(["set", "KEY", "value"]), env, cwd)).rejects.toMatchObject({ code: "usage" });
    await expect(set(parseArgs(["set", "1BAD"]), env, cwd)).rejects.toMatchObject({ code: "usage" });
    await expect(set(parseArgs(["set", "KEY"]), env, cwd, () => Promise.reject(new NoTerminalError()))).rejects.toMatchObject({
      code: "no_terminal",
    });
    setUiMode({ input: false });
    await expect(set(parseArgs(["set", "KEY"]), env, cwd, () => Promise.resolve("x"))).rejects.toMatchObject({ code: "no_terminal" });
  });
});

describe("list --versions and recover", () => {
  it("brings one key back from an older version, leaving the rest", async () => {
    await save(`A=1\nPROBE_GALLERY_ID="${SECRET}_g"\n`);
    const old = versions[0]!.id;
    await save("A=1\n");
    await writeFile(path.join(cwd, ".env.local"), "# App\nA=1\nB=2\n");

    expect(await list(parseArgs(["list", "--versions"]), env, cwd)).toBe(0);
    expect(output).toContain(`  ${old.slice(0, 8)}  2026-10-27 10:01`);

    output = [];
    expect(await recover(parseArgs(["recover", "PROBE_GALLERY_ID", "--from", old.slice(0, 8)]), env, cwd, prompt)).toBe(0);
    expect(await local()).toBe(`# App\nA=1\nB=2\nPROBE_GALLERY_ID="${SECRET}_g"\n`);
    expect(output[0]).toBe(`✓ set PROBE_GALLERY_ID in .env.local from version ${old.slice(0, 8)}`);
  });

  it("says when the key or the version is not there", async () => {
    await save("A=1\n");
    await expect(recover(parseArgs(["recover", "NOPE", "--from", versions[0]!.id]), env, cwd, prompt)).rejects.toMatchObject({ code: "not_found" });
    await expect(recover(parseArgs(["recover", "A", "--from", "zzzz"]), env, cwd, prompt)).rejects.toThrow(/No version/);
    await expect(recover(parseArgs(["recover", "A"]), env, cwd, prompt)).rejects.toMatchObject({ code: "usage" });
  });
});
