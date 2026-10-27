import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptBlob, setupVault, type VaultSetupResult } from "../shared/crypto.ts";
import type { EncryptedBlob } from "../shared/types.ts";
import { parseArgs } from "./args.ts";
import { run, type RunDeps } from "./commands/run.ts";
import { NoTerminalError } from "./prompt.ts";
import { REDACTED } from "./redact.ts";
import { resetUi, setUiMode } from "./ui.ts";

// `klef run` end to end: real crypto, a fake network, and a real child
// process (node itself). The child gets the values; what comes back out of
// it does not carry them.

const PASSPHRASE = "correct horse battery staple";
const SECRET = "sk_live_do_not_print_me_0123456789";
const OTHER = "whsec_also_never_printed";
const LOCAL = `# App\nAPI_KEY=${SECRET}\nPORT=3000\nQUOTED="hello world"\nDEBUG=false\n`;
const PROD = `API_KEY=${OTHER}\nREGION=eu-west-1\n`;

let vault: VaultSetupResult;
let root: string;
let cwd: string;
let env: NodeJS.ProcessEnv;
let files: Map<string, EncryptedBlob[]>;
let console_: string[];
let stdout: string;
let stderr: string;
let signals: EventEmitter;
let deps: RunDeps;

beforeAll(async () => {
  vault = await setupVault(PASSPHRASE);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function fakeFetch(input: string | URL | Request): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input.toString());
  if (url.pathname === "/api/vault") return json({ exists: true, keyMaterial: vault.keyMaterial });
  if (url.pathname === "/api/tree") {
    const nodes = [...files].map(([name, versions]) => ({
      id: name,
      name,
      currentVersionId: versions.length ? `v${versions.length}` : null,
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
          projects: [{ id: "p", name: "lensdrop", framework: null, icon: null, createdAt: "", files: nodes }],
        },
      ],
    });
  }
  const match = url.pathname.match(/^\/api\/files\/([^/]+)\/current$/);
  if (match) {
    const versions = files.get(decodeURIComponent(match[1]!));
    if (!versions) return json({ error: "Not found" }, 404);
    const blob = versions.at(-1);
    return json({ version: blob ? { id: `v${versions.length}`, blob, createdAt: "" } : null });
  }
  return new Response("not found", { status: 404 });
}

async function save(name: string, text: string): Promise<void> {
  const versions = files.get(name) ?? [];
  versions.push(await encryptBlob(vault.dek, text));
  files.set(name, versions);
}

const prompt = () => Promise.resolve(PASSPHRASE);

/** `klef run [flags] -- node -e <script>`. */
function klefRun(script: string, flags: string[] = []) {
  return run(parseArgs(["run", ...flags, "--", process.execPath, "-e", script]), env, cwd, prompt, deps);
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "klef-run-"));
  cwd = path.join(root, "lensdrop");
  await mkdir(cwd);
  env = {
    KLEF_TOKEN: "klef_pat_test",
    KLEF_API_URL: "https://klef.test",
    KLEF_AGENT_SOCK: path.join(root, ".agent", "agent.sock"),
    KLEF_CONFIG_DIR: path.join(root, ".config"),
    PORT: "1",
  };
  files = new Map();
  await save(".env.local", LOCAL);
  await save(".env.production", PROD);
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
  console_ = [];
  stdout = "";
  stderr = "";
  signals = new EventEmitter();
  deps = { stdout: (t) => void (stdout += t), stderr: (t) => void (stderr += t), signals };
  vi.stubGlobal("fetch", fakeFetch);
  const capture = (...parts: unknown[]) => void console_.push(parts.join(" "));
  vi.spyOn(console, "log").mockImplementation(capture);
  vi.spyOn(console, "error").mockImplementation(capture);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetUi();
  await rm(root, { recursive: true, force: true });
  for (const text of [console_.join("\n"), stdout, stderr]) {
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(OTHER);
  }
});

describe("run", () => {
  it("gives the command the file's variables, unquoted, with the file winning over the environment", async () => {
    const code = await klefRun(
      `console.log([process.env.API_KEY === ${JSON.stringify(SECRET)}, process.env.PORT, process.env.QUOTED === "hello world", process.env.DEBUG].join("|"))`,
    );
    expect(code).toBe(0);
    expect(stdout).toBe("true|3000|true|false\n");
  });

  it("writes no file", async () => {
    await klefRun("");
    expect(await readdir(cwd)).toEqual([".klef.json"]);
  });

  it("redacts a value the command prints, on either stream, and counts it", async () => {
    const code = await klefRun(
      `console.log("key is " + process.env.API_KEY); console.error("again: " + process.env.API_KEY + " twice " + process.env.API_KEY)`,
    );
    expect(code).toBe(0);
    expect(stdout).toBe(`key is ${REDACTED}\n`);
    expect(stderr).toBe(`again: ${REDACTED} twice ${REDACTED}\n`);
  });

  it("redacts a value the command prints in two pieces", async () => {
    const code = await klefRun(
      `const k = process.env.API_KEY; process.stdout.write("token: " + k.slice(0, 9)); setTimeout(() => process.stdout.write(k.slice(9) + " end\\n"), 20)`,
    );
    expect(code).toBe(0);
    expect(stdout).toBe(`token: ${REDACTED} end\n`);
  });

  it("forwards a line with no newline after a pause, redacted, so prompts show", async () => {
    const code = await klefRun(
      `process.stdout.write("Password for " + process.env.API_KEY + ": "); setTimeout(() => process.stdout.write("done\\n"), 300)`,
    );
    expect(code).toBe(0);
    expect(stdout).toBe(`Password for ${REDACTED}: done\n`);
  });

  it("leaves short and never-secret values alone", async () => {
    await klefRun(`console.log("port " + process.env.PORT + " debug " + process.env.DEBUG)`);
    expect(stdout).toBe("port 3000 debug false\n");
  });

  it("passes the command's exit code through", async () => {
    expect(await klefRun("process.exit(7)")).toBe(7);
  });

  it("reports 128 plus the signal when the command dies of one", async () => {
    expect(await klefRun("process.kill(process.pid, 'SIGKILL')")).toBe(137);
  });

  it("passes SIGTERM on to the command", async () => {
    deps.stdout = (t) => {
      stdout += t;
      if (stdout.includes("ready")) signals.emit("SIGTERM");
    };
    const code = await klefRun(
      `process.on("SIGTERM", () => process.exit(9)); console.log("ready"); setInterval(() => {}, 1000)`,
    );
    expect(code).toBe(9);
    expect(signals.listenerCount("SIGTERM")).toBe(0);
    expect(signals.listenerCount("SIGINT")).toBe(0);
  });

  it("takes another file with --file", async () => {
    await klefRun(
      `console.log(process.env.REGION === "eu-west-1", process.env.API_KEY === ${JSON.stringify(OTHER)}, process.env.PORT)`,
      ["--file", ".env.production"],
    );
    expect(stdout).toBe("true true 1\n");
  });

  it("merges every file with --all, the later file winning", async () => {
    await klefRun(
      `console.log(process.env.PORT, process.env.REGION === "eu-west-1", process.env.API_KEY === ${JSON.stringify(OTHER)})`,
      ["--all"],
    );
    expect(stdout).toBe("3000 true true\n");
  });

  it("prints one JSON object with the exit code and the redaction count, the output going to stderr", async () => {
    setUiMode({ json: true }, "run");
    const code = await klefRun(`console.log(process.env.API_KEY); process.exit(3)`, ["--json"]);
    expect(code).toBe(3);
    expect(stdout).toBe("");
    expect(stderr).toBe(`${REDACTED}\n`);
    expect(JSON.parse(console_.join("\n"))).toMatchObject({
      ok: true,
      command: "run",
      data: {
        files: [{ file: ".env.local", variables: 4, version: "v1" }],
        exitCode: 3,
        redactions: 1,
        redacted: true,
      },
    });
  });

  it("warns on --no-redact, and says so under --json", async () => {
    const code = await klefRun("", ["--no-redact"]);
    expect(code).toBe(0);
    expect(console_.join("\n")).toContain("Output is not redacted");

    resetUi();
    setUiMode({ json: true }, "run");
    console_ = [];
    await klefRun("", ["--no-redact", "--json"]);
    expect(JSON.parse(console_.join("\n"))).toMatchObject({
      data: { redacted: false, redactions: 0 },
      warnings: [{ code: "no_redact" }],
    });
  });

  it("stops with locked, exit 4, when nobody can unlock, before running anything", async () => {
    const noTerminal = () => Promise.reject(new NoTerminalError());
    await expect(
      run(parseArgs(["run", "--", process.execPath, "-e", "console.log('ran')"]), env, cwd, noTerminal, deps),
    ).rejects.toMatchObject({
      code: "locked",
      exitCode: 4,
      next: [{ command: "klef login" }, { command: "klef unlock" }],
    });
    expect(stdout).toBe("");
  });

  it("is a usage error without a command", async () => {
    await expect(run(parseArgs(["run"]), env, cwd, prompt, deps)).rejects.toMatchObject({
      code: "usage",
      next: [{ command: "klef run -- npm run dev" }],
    });
  });

  it("says when the command cannot be found", async () => {
    await expect(
      run(parseArgs(["run", "--", "klef-no-such-program-xyz"]), env, cwd, prompt, deps),
    ).rejects.toMatchObject({ code: "usage", message: "Could not run klef-no-such-program-xyz: command not found." });
  });

  it("refuses --path, which has no file to point at", async () => {
    await expect(run(parseArgs(["run", "--path", "x", "--", "true"]), env, cwd, prompt, deps)).rejects.toMatchObject({
      code: "usage",
    });
  });
});
