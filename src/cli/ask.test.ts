import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptBlob, encryptBlob, setupVault, type VaultSetupResult } from "../shared/crypto.ts";
import type { EncryptedBlob } from "../shared/types.ts";
import { parseArgs } from "./args.ts";
import { ask, type AskDeps } from "./commands/ask.ts";
import { loadSyncState, recordSynced } from "./sync-state.ts";
import { resetUi, setUiMode, type CliError } from "./ui.ts";

// `klef ask` end to end against a fake server with real crypto. The fake
// plays the user too: after a few polls they save a version in the web app,
// the way the editor does, and klef has to notice the key arrive.

const PASSPHRASE = "correct horse battery staple";
const SECRET = "sk_test do-not-print-me";

let vault: VaultSetupResult;
let cwd: string;
let env: NodeJS.ProcessEnv;
let versions: { id: string; blob: EncryptedBlob }[];
let output: string[];
let opened: string[];
let polls: number;
/** What the user saves, and on which poll; null saves nothing. */
let userSaves: { onPoll: number; text: (current: string) => string }[];

beforeAll(async () => {
  vault = await setupVault(PASSPHRASE);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function save(text: string): Promise<string> {
  const id = `v${versions.length + 1}`;
  versions.push({ id, blob: await encryptBlob(vault.dek, text) });
  return id;
}

const stored = () => (versions.length ? decryptBlob(vault.dek, versions.at(-1)!.blob) : Promise.resolve(""));

async function fakeFetch(input: string | URL | Request): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input.toString());
  const p = url.pathname;
  if (p === "/api/vault") return json({ exists: true, keyMaterial: vault.keyMaterial });
  if (p === "/api/tree") {
    const files = [{ id: "f", name: ".env.local", currentVersionId: versions.at(-1)?.id ?? null, environment: null, createdAt: "" }];
    return json({ workspaces: [{ id: "w", name: "Personal", icon: null, createdAt: "", projects: [{ id: "p", name: "lensdrop", framework: null, icon: null, createdAt: "", files }] }] });
  }
  if (p === "/api/files/f/current") {
    polls++;
    for (const s of userSaves.filter((s) => s.onPoll === polls - 1)) await save(s.text(await stored()));
    const v = versions.at(-1);
    return json({ version: v ? { ...v, createdAt: "" } : null });
  }
  return new Response("not found", { status: 404 });
}

/** No real waiting: each sleep moves the clock on. */
function fakeDeps(): AskDeps {
  let clock = 0;
  return {
    open: (u) => void opened.push(u),
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
    prompt: () => Promise.resolve(PASSPHRASE),
  };
}

const localPath = () => path.join(cwd, ".env.local");
const local = () => readFile(localPath(), "utf8");
const run = (...argv: string[]) => ask(parseArgs(["ask", ...argv]), env, cwd, fakeDeps());

beforeEach(async () => {
  cwd = await mkdtemp(path.join(tmpdir(), "klef-ask-"));
  env = {
    KLEF_TOKEN: "klef_pat_test",
    KLEF_API_URL: "https://klef.test",
    KLEF_CONFIG_DIR: path.join(cwd, ".config"),
    KLEF_AGENT_SOCK: path.join(cwd, ".agent.sock"),
    KLEF_NO_KEYCHAIN: "1",
    KLEF_NO_REMEMBER: "1",
  };
  versions = [];
  output = [];
  opened = [];
  polls = 0;
  userSaves = [];
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
  // The one rule: whatever happened, the value never reached the output.
  expect(output.join("\n")).not.toContain("do-not-print-me");
});

/** The user adds the key in the editor and saves, on the given poll. */
const userAdds = (onPoll: number, line = `STRIPE_SECRET_KEY='${SECRET}'`) =>
  userSaves.push({ onPoll, text: (current) => `${current}${line}\n` });

describe("klef ask", () => {
  it("opens the file in the app, waits for the key, and sets it locally", async () => {
    const v1 = await save("# Stripe\nA=1\n");
    await writeFile(localPath(), "# Stripe\nA=1\n");
    await recordSynced(env, [{ file: localPath(), versionId: v1 }]);
    userAdds(3);

    expect(await run("STRIPE_SECRET_KEY", "--reason", "Stripe test checkout")).toBe(0);

    expect(opened).toEqual(["https://klef.test/app?file=f&ask=STRIPE_SECRET_KEY&reason=Stripe+test+checkout"]);
    expect(await local()).toBe(`# Stripe\nA=1\nSTRIPE_SECRET_KEY='${SECRET}'\n`);
    // Byte for byte the vault's copy, so the file reads as in sync.
    expect(await local()).toBe(await stored());
    expect((await loadSyncState(env))[localPath()]?.versionId).toBe("v2");
    expect(output).toContain("✓ STRIPE_SECRET_KEY is set in the vault and in .env.local");
  });

  it("keeps waiting through saves that don't give the key a value", async () => {
    await save("A=1\n");
    await writeFile(localPath(), "A=1\n");
    userSaves.push({ onPoll: 1, text: (t) => `${t}OTHER=1\n` });
    userAdds(2, "STRIPE_SECRET_KEY=");
    userAdds(4);
    expect(await run("STRIPE_SECRET_KEY")).toBe(0);
    expect(await local()).toBe(`A=1\nSTRIPE_SECRET_KEY='${SECRET}'\n`);
    expect(versions).toHaveLength(4);
  });

  it("waits for a new value when the key already had one", async () => {
    await save("STRIPE_SECRET_KEY=old\n");
    await writeFile(localPath(), "STRIPE_SECRET_KEY=old\n");
    userSaves.push({ onPoll: 1, text: (t) => `${t}OTHER=1\n` });
    userSaves.push({ onPoll: 2, text: () => `STRIPE_SECRET_KEY='${SECRET}'\nOTHER=1\n` });
    expect(await run("STRIPE_SECRET_KEY")).toBe(0);
    expect(await local()).toBe(`STRIPE_SECRET_KEY='${SECRET}'\n`);
  });

  it("leaves the sync record alone when the local file had drifted", async () => {
    const v1 = await save("A=1\n");
    await writeFile(localPath(), "A=1\nLOCAL=2\n");
    await recordSynced(env, [{ file: localPath(), versionId: v1 }]);
    userAdds(1);
    expect(await run("STRIPE_SECRET_KEY")).toBe(0);
    expect(await local()).toBe(`A=1\nLOCAL=2\nSTRIPE_SECRET_KEY='${SECRET}'\n`);
    expect((await loadSyncState(env))[localPath()]?.versionId).toBe(v1);
  });

  it("reports one JSON object, with the link on stderr for the person", async () => {
    await save("A=1\n");
    await writeFile(localPath(), "A=1\n");
    userAdds(1);
    setUiMode({ json: true }, "ask");
    expect(await run("STRIPE_SECRET_KEY", "--json", "--no-open")).toBe(0);

    expect(output[0]).toBe("Set STRIPE_SECRET_KEY in your browser: https://klef.test/app?file=f&ask=STRIPE_SECRET_KEY");
    expect(JSON.parse(output.slice(1).join("\n"))).toMatchObject({
      ok: true,
      command: "ask",
      data: { name: "STRIPE_SECRET_KEY", file: ".env.local", path: ".env.local", local: "written", added: true, version: "v2" },
    });
    expect(opened).toEqual([]);
  });

  it("only waits on the vault when the local file isn't here", async () => {
    userAdds(1);
    expect(await run("STRIPE_SECRET_KEY")).toBe(0);
    await expect(local()).rejects.toThrow();
    expect(output).toContain("✓ STRIPE_SECRET_KEY is set in the vault (.env.local)");
  });

  it("exits 7 when nothing is saved in time, writing nothing", async () => {
    await save("A=1\n");
    await writeFile(localPath(), "A=1\n");
    const err = (await run("STRIPE_SECRET_KEY", "--timeout", "2m").catch((e) => e)) as CliError;
    expect(err.code).toBe("timed_out");
    expect(err.exitCode).toBe(7);
    expect(err.next).toEqual([{ command: "klef ask STRIPE_SECRET_KEY" }]);
    expect(polls).toBe(1 + 40); // the start, then every 3s for 2 minutes
    expect(await local()).toBe("A=1\n");
  });

  it("says so before opening anything when the device is locked", async () => {
    await save("A=1\n");
    setUiMode({ input: false });
    const deps = { ...fakeDeps(), prompt: undefined };
    await expect(ask(parseArgs(["ask", "STRIPE_SECRET_KEY"]), env, cwd, deps)).rejects.toMatchObject({ code: "locked", exitCode: 4 });
    expect(opened).toEqual([]);
  });

  it("refuses bad usage before contacting anyone", async () => {
    for (const argv of [[], ["A", "B"], ["1BAD"], ["A", "--timeout", "1h"], ["A", "--timeout", "soon"], ["A", "--reason"]]) {
      await expect(run(...argv), argv.join(" ")).rejects.toMatchObject({ code: "usage", exitCode: 2 });
    }
    expect(polls).toBe(0);
  });

  it("says when this directory isn't linked", async () => {
    await rm(path.join(cwd, ".klef.json"));
    await expect(run("STRIPE_SECRET_KEY")).rejects.toMatchObject({ code: "not_linked", exitCode: 6 });
  });
});
