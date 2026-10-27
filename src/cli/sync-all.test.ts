import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptBlob,
  encryptBlob,
  setupVault,
  unlockWithKekBytes,
  type VaultSetupResult,
} from "../shared/crypto.ts";
import { base64ToBytes } from "../shared/encoding.ts";
import type { EncryptedBlob } from "../shared/types.ts";
import { parseArgs } from "./args.ts";
import { startAgent, type AgentHandoff, type RunningAgent } from "./agent.ts";
import { agentStatus } from "./agent-client.ts";
import { pull } from "./commands/pull.ts";
import { push } from "./commands/push.ts";
import { unlock } from "./commands/unlock.ts";
import { lock } from "./commands/lock.ts";
import { logout } from "./commands/logout.ts";
import { NoTerminalError } from "./prompt.ts";

// pull, push and unlock end to end against an in-memory API: real crypto, real
// files, real agent socket, fake network. What these pin down is the point of
// the feature: one passphrase for many files, and none at all while unlocked.

const PASSPHRASE = "correct horse battery staple";
const SECRET = "sk_live_do_not_print_me";

const FILES = {
  ".env.local": `# App\nAPI_KEY=${SECRET}_local\n`,
  ".env.production": `# App\nAPI_KEY=${SECRET}_prod\n`,
  "mobile.env.local": `# Mobile\nEXPO_KEY=${SECRET}_mobile\n`,
} as const;
type Name = keyof typeof FILES;

const CONFIG = {
  workspace: "Personal",
  project: "lensdrop",
  file: ".env.local",
  environment: null,
  files: [
    { file: ".env.local" },
    { file: ".env.production" },
    { file: "mobile.env.local", path: "apps/mobile/.env.local" },
  ],
};

let vault: VaultSetupResult;
let cwd: string;
let env: NodeJS.ProcessEnv;
let versions: Map<string, EncryptedBlob[]>;
let agent: RunningAgent | null;
let output: string[];

beforeAll(async () => {
  vault = await setupVault(PASSPHRASE);
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

/** Just enough of the Klef API for pull and push. Ids are the file names. */
async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input.toString());
  if (url.pathname === "/api/vault") return json({ exists: true, keyMaterial: vault.keyMaterial });
  if (url.pathname === "/api/tree") {
    const files = Object.keys(FILES).map((name) => ({
      id: name,
      name,
      currentVersionId: versions.get(name)?.length ? `v${versions.get(name)!.length}` : null,
      environment: null,
      createdAt: "",
    }));
    return json({
      workspaces: [
        {
          id: "w",
          name: "Personal",
          icon: null,
          createdAt: "",
          projects: [{ id: "p", name: "lensdrop", framework: null, icon: null, createdAt: "", files }],
        },
      ],
    });
  }
  const match = url.pathname.match(/^\/api\/files\/([^/]+)\/(current|versions)$/);
  if (match) {
    const name = decodeURIComponent(match[1]!);
    const list = versions.get(name) ?? [];
    if (match[2] === "current") {
      const blob = list.at(-1);
      return json({ version: blob ? { id: `v${list.length}`, blob, createdAt: "" } : null });
    }
    if (init?.method === "POST") {
      const { blob } = JSON.parse(String(init.body)) as { blob: EncryptedBlob };
      versions.set(name, [...list, blob]);
      return json({ id: `version-${name}-${list.length + 1}`, createdAt: "" });
    }
  }
  return new Response("not found", { status: 404 });
}

async function seedVersions(): Promise<void> {
  for (const [name, text] of Object.entries(FILES)) {
    versions.set(name, [await encryptBlob(vault.dek, text)]);
  }
}

async function stored(name: Name): Promise<string> {
  return decryptBlob(vault.dek, versions.get(name)!.at(-1)!);
}

function counting(answer = PASSPHRASE) {
  const prompt = Object.assign(
    () => {
      prompt.calls++;
      return Promise.resolve(answer);
    },
    { calls: 0 },
  );
  return prompt;
}

const never = () => Promise.reject(new Error("prompted for the passphrase"));
const yes = () => Promise.resolve(true);

/** Agent start without a child process: same handoff, unwrapped in-process. */
async function startInProcess(handoff: AgentHandoff): Promise<void> {
  const dek = await unlockWithKekBytes(base64ToBytes(handoff.kek), handoff.wrappedDek);
  agent = await startAgent({ ...handoff, dek });
}

beforeEach(async () => {
  cwd = await mkdtemp(path.join(tmpdir(), "klef-sync-"));
  env = {
    KLEF_TOKEN: "klef_pat_test",
    KLEF_API_URL: "https://klef.test",
    KLEF_AGENT_SOCK: path.join(cwd, ".agent", "agent.sock"),
    // Pull and push record what they synced; keep that out of the real home.
    KLEF_CONFIG_DIR: path.join(cwd, ".config"),
  };
  versions = new Map();
  agent = null;
  output = [];
  await writeFile(path.join(cwd, ".klef.json"), JSON.stringify(CONFIG));
  vi.stubGlobal("fetch", fakeFetch);
  const capture = (...parts: unknown[]) => void output.push(parts.join(" "));
  vi.spyOn(console, "log").mockImplementation(capture);
  vi.spyOn(console, "error").mockImplementation(capture);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await agent?.lock();
  await rm(cwd, { recursive: true, force: true });
  // The rule the whole CLI is built around, checked on every test's output.
  expect(output.join("\n")).not.toContain(SECRET);
});

async function writeLocal(): Promise<void> {
  await mkdir(path.join(cwd, "apps/mobile"), { recursive: true });
  await writeFile(path.join(cwd, ".env.local"), FILES[".env.local"]);
  await writeFile(path.join(cwd, ".env.production"), FILES[".env.production"]);
  await writeFile(path.join(cwd, "apps/mobile/.env.local"), FILES["mobile.env.local"]);
}

describe("pull --all", () => {
  it("writes every listed file, owner-only, for one passphrase", async () => {
    await seedVersions();
    const prompt = counting();

    expect(await pull(parseArgs(["pull", "--all"]), env, cwd, prompt)).toBe(0);

    expect(prompt.calls).toBe(1);
    expect(await readFile(path.join(cwd, ".env.local"), "utf8")).toBe(FILES[".env.local"]);
    expect(await readFile(path.join(cwd, ".env.production"), "utf8")).toBe(FILES[".env.production"]);
    const mobile = path.join(cwd, "apps/mobile/.env.local");
    expect(await readFile(mobile, "utf8")).toBe(FILES["mobile.env.local"]);
    expect((await stat(mobile)).mode & 0o777).toBe(0o600);
    expect(output).toContain("✓ Wrote 1 variable to apps/mobile/.env.local");
  });

  it("writes nothing when one listed file has no saved version", async () => {
    await seedVersions();
    versions.delete(".env.production");

    await expect(pull(parseArgs(["pull", "--all"]), env, cwd, never)).rejects.toMatchObject({
      code: "not_found",
      exitCode: 6,
    });
    await expect(stat(path.join(cwd, ".env.local"))).rejects.toThrow();
  });

  it("tells an agent to hand unlocking to the user when there is no terminal", async () => {
    await seedVersions();
    const noTerminal = () => Promise.reject(new NoTerminalError());
    await expect(pull(parseArgs(["pull", "--all"]), env, cwd, noTerminal)).rejects.toMatchObject({
      code: "locked",
      exitCode: 4,
      next: [{ command: "klef login" }, { command: "klef unlock" }],
    });
    await expect(stat(path.join(cwd, ".env.local"))).rejects.toThrow();
  });

  it("takes a listed file's local path when --file names it", async () => {
    await seedVersions();
    expect(await pull(parseArgs(["pull", "--file", "mobile.env.local"]), env, cwd, counting())).toBe(0);
    expect(await readFile(path.join(cwd, "apps/mobile/.env.local"), "utf8")).toBe(
      FILES["mobile.env.local"],
    );
  });
});

describe("push --all", () => {
  it("pushes every changed file for one passphrase and one confirmation", async () => {
    await seedVersions();
    await writeLocal();
    await writeFile(path.join(cwd, ".env.production"), `${FILES[".env.production"]}NEW=1\n`);
    await writeFile(path.join(cwd, "apps/mobile/.env.local"), "# Mobile\nEXPO_KEY=rotated\n");

    const prompt = counting();
    const questions: string[] = [];
    const ask = (q: string) => {
      questions.push(q);
      return Promise.resolve(true);
    };

    expect(await push(parseArgs(["push", "--all"]), env, cwd, prompt, ask)).toBe(0);

    expect(prompt.calls).toBe(1);
    expect(questions).toEqual(["Push 2 files?"]);
    expect(versions.get(".env.local")).toHaveLength(1);
    expect(await stored(".env.production")).toBe(`${FILES[".env.production"]}NEW=1\n`);
    expect(await stored("mobile.env.local")).toBe("# Mobile\nEXPO_KEY=rotated\n");
    expect(output).toContain("✓ .env.local is already up to date");
  });

  it("reads every file before asking for anything, and stops on a missing one", async () => {
    await writeLocal();
    await rm(path.join(cwd, "apps/mobile/.env.local"));
    const fetchSpy = vi.fn(fakeFetch);
    vi.stubGlobal("fetch", fetchSpy);

    await expect(push(parseArgs(["push", "--all", "-y"]), env, cwd, never, yes)).rejects.toThrow(
      "Can't read apps/mobile/.env.local here. Nothing pushed.",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("pushes nothing when the confirmation is declined", async () => {
    await writeLocal();
    const no = () => Promise.resolve(false);
    expect(await push(parseArgs(["push", "--all"]), env, cwd, counting(), no)).toBe(1);
    expect(versions.size).toBe(0);
  });

  it("refuses --all with --file", async () => {
    await expect(
      push(parseArgs(["push", "--all", "--file", ".env"]), env, cwd, never, yes),
    ).rejects.toThrow(/--all/);
  });
});

describe("unlock, then push and pull", () => {
  // The unlock agent: what `unlock` uses when remembering is off.
  beforeEach(() => {
    env.KLEF_NO_REMEMBER = "1";
  });

  it("asks once at unlock, then not at all", async () => {
    const prompt = counting();
    expect(await unlock(parseArgs(["unlock"]), env, prompt, startInProcess)).toBe(0);
    expect(prompt.calls).toBe(1);
    expect((await agentStatus(env.KLEF_AGENT_SOCK!))?.msLeft).toBeGreaterThan(0);

    await writeLocal();
    expect(await push(parseArgs(["push", "--file", ".env.local", "-y"]), env, cwd, never, yes)).toBe(0);
    expect(await push(parseArgs(["push", "--file", ".env.production", "-y"]), env, cwd, never, yes)).toBe(0);
    expect(await stored(".env.production")).toBe(FILES[".env.production"]);

    await rm(path.join(cwd, ".env.local"));
    expect(await pull(parseArgs(["pull"]), env, cwd, never)).toBe(0);
    expect(await readFile(path.join(cwd, ".env.local"), "utf8")).toBe(FILES[".env.local"]);
  });

  it("keeps -y and the confirmation exactly as without the agent", async () => {
    await unlock(parseArgs(["unlock"]), env, counting(), startInProcess);
    await writeLocal();
    const questions: string[] = [];
    const ask = (q: string) => {
      questions.push(q);
      return Promise.resolve(true);
    };
    expect(await push(parseArgs(["push"]), env, cwd, never, ask)).toBe(0);
    expect(questions).toEqual(["Push?"]);
  });

  it("does not prompt again when already unlocked", async () => {
    await unlock(parseArgs(["unlock"]), env, counting(), startInProcess);
    expect(await unlock(parseArgs(["unlock"]), env, never, startInProcess)).toBe(0);
    expect(output.at(-1)).toMatch(/^✓ Already unlocked\. Locks in \d+ min without use$/);
  });

  it("prompts again after lock", async () => {
    await unlock(parseArgs(["unlock"]), env, counting(), startInProcess);
    expect(await lock(env)).toBe(0);
    await agent!.locked;
    agent = null;

    await seedVersions();
    const prompt = counting();
    expect(await pull(parseArgs(["pull"]), env, cwd, prompt)).toBe(0);
    expect(prompt.calls).toBe(1);
    expect(output).toContain("✓ Locked. The key is gone from memory");
  });

  it("--for holds the key longer than the 15-minute default", async () => {
    expect(await unlock(parseArgs(["unlock", "--for", "8h"]), env, counting(), startInProcess)).toBe(0);
    expect(output).toContain("✓ Unlocked. Locks after 8 hours without use");
    const status = await agentStatus(env.KLEF_AGENT_SOCK!);
    expect(status?.idleMinutes).toBe(8 * 60);
    expect(status?.msLeft).toBeGreaterThan(7 * 60 * 60_000);
  });

  it("refuses a bad --for before asking for the passphrase", async () => {
    for (const bad of ["forever", "0m", "8 weeks", "8d", "-1h"]) {
      await expect(unlock(parseArgs(["unlock", `--for=${bad}`]), env, never, startInProcess)).rejects.toMatchObject({
        code: "usage",
      });
    }
    expect(await agentStatus(env.KLEF_AGENT_SOCK!)).toBeNull();
  });

  it("refuses a wrong passphrase without starting anything", async () => {
    await expect(unlock(parseArgs(["unlock"]), env, counting("wrong"), startInProcess)).rejects.toThrow();
    expect(await agentStatus(env.KLEF_AGENT_SOCK!)).toBeNull();
  });
});

describe("remembered on this device", () => {
  const keyFile = () => path.join(env.KLEF_CONFIG_DIR!, "vault-key.json");

  it("remembers the key after one passphrase, and never asks again", async () => {
    await seedVersions();
    const prompt = counting();
    expect(await pull(parseArgs(["pull"]), env, cwd, prompt)).toBe(0);
    expect(prompt.calls).toBe(1);
    expect((await stat(keyFile())).mode & 0o777).toBe(0o600);
    // No agent is running: the key file alone opens the vault.
    expect(await agentStatus(env.KLEF_AGENT_SOCK!)).toBeNull();

    await writeLocal();
    await writeFile(path.join(cwd, ".env.production"), `${FILES[".env.production"]}NEW=1\n`);
    expect(await push(parseArgs(["push", "--all", "-y"]), env, cwd, never, yes)).toBe(0);
    expect(await stored(".env.production")).toBe(`${FILES[".env.production"]}NEW=1\n`);
  });

  it("is what unlock does, with no agent", async () => {
    expect(await unlock(parseArgs(["unlock"]), env, counting(), startInProcess)).toBe(0);
    expect(agent).toBeNull();
    expect(output).toContain("✓ Unlocked on this device");
    await seedVersions();
    expect(await pull(parseArgs(["pull"]), env, cwd, never)).toBe(0);
    expect(await unlock(parseArgs(["unlock"]), env, never, startInProcess)).toBe(0);
    expect(output).toContain("✓ Already unlocked on this device");
  });

  it("still uses the agent for a time-limited unlock", async () => {
    expect(await unlock(parseArgs(["unlock", "--for", "1h"]), env, counting(), startInProcess)).toBe(0);
    expect(agent).not.toBeNull();
    await expect(stat(keyFile())).rejects.toThrow();
  });

  it("is forgotten by lock and by logout", async () => {
    await seedVersions();
    await pull(parseArgs(["pull"]), env, cwd, counting());
    expect(await lock(env)).toBe(0);
    expect(output).toContain("✓ Locked. The key is forgotten on this device");
    await expect(stat(keyFile())).rejects.toThrow();

    await pull(parseArgs(["pull"]), env, cwd, counting());
    await logout(env);
    await expect(stat(keyFile())).rejects.toThrow();
  });

  it("is not kept when remembering is off", async () => {
    await seedVersions();
    env.KLEF_NO_REMEMBER = "1";
    const prompt = counting();
    await pull(parseArgs(["pull"]), env, cwd, prompt);
    await pull(parseArgs(["pull"]), env, cwd, prompt);
    expect(prompt.calls).toBe(2);
    await expect(stat(keyFile())).rejects.toThrow();
  });

  it("is ignored for another vault, and forgotten when it stops decrypting", async () => {
    await seedVersions();
    await pull(parseArgs(["pull"]), env, cwd, counting());
    // A key file that claims this vault but holds another key.
    const record = JSON.parse(await readFile(keyFile(), "utf8"));
    record.key = Buffer.alloc(32, 7).toString("base64");
    await writeFile(keyFile(), JSON.stringify(record));
    await expect(pull(parseArgs(["pull"]), env, cwd, never)).rejects.toThrow(/no longer opens the vault/);
    await expect(stat(keyFile())).rejects.toThrow();
  });
});
