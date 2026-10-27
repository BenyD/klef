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

// `klef run` end to end: real files, real crypto, a fake network, and a real
// child process (node itself). The child gets the values; what comes back
// out of it does not carry them, and klef's own output never does.

const PASSPHRASE = "correct horse battery staple";
const SECRET = "sk_live_do_not_print_me_0123456789";
const VAULT_SECRET = "sk_live_from_the_vault_9876543210";
const OTHER = "whsec_also_never_printed";
const LOCAL = `# App\nAPI_KEY="${SECRET} # not a comment"\nPORT=3000 # comment\nQUOTED="hello world"\nDEBUG=false\nEMPTY=\n`;
const VAULT_LOCAL = `API_KEY=${VAULT_SECRET}\nPORT=4000\n`;
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
    KEEP: "from-parent",
  };
  files = new Map();
  await save(".env.local", VAULT_LOCAL);
  await save(".env.production", PROD);
  await writeFile(
    path.join(cwd, ".klef.json"),
    JSON.stringify({
      workspace: "Personal",
      project: "lensdrop",
      file: ".env.local",
      environment: null,
      files: [{ file: ".env.local" }, { file: ".env.production" }, { file: "prod.env", path: "config/.env.production" }],
    }),
  );
  await writeFile(path.join(cwd, ".env.local"), LOCAL);
  await writeFile(path.join(cwd, ".env.production"), PROD);
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
    for (const secret of [SECRET, VAULT_SECRET, OTHER]) expect(text).not.toContain(secret);
  }
});

describe("run", () => {
  it("gives the command the local file's variables, decoded, over the parent's environment", async () => {
    const code = await klefRun(
      `console.log([process.env.API_KEY === ${JSON.stringify(`${SECRET} # not a comment`)}, process.env.PORT, process.env.QUOTED === "hello world", process.env.DEBUG, process.env.EMPTY === "", process.env.KEEP].join("|"))`,
    );
    expect(code).toBe(0);
    expect(stdout).toBe("true|3000|true|false|true|from-parent\n");
    expect(console_).toEqual([`klef: 5 variables from .env.local; a value in the output shows as ${REDACTED}`]);
  });

  it("writes nothing", async () => {
    const before = await readdir(cwd);
    await klefRun("");
    expect(await readdir(cwd)).toEqual(before);
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

  it("passes SIGTERM on to the command, and ignores SIGINT itself", async () => {
    deps.stdout = (t) => {
      stdout += t;
      if (stdout.includes("ready")) {
        signals.emit("SIGINT");
        signals.emit("SIGTERM");
      }
    };
    const code = await klefRun(
      `process.on("SIGTERM", () => process.exit(9)); console.log("ready"); setInterval(() => {}, 1000)`,
    );
    expect(code).toBe(9);
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) expect(signals.listenerCount(signal)).toBe(0);
  });

  it("takes another listed file with --file, at its local path", async () => {
    await klefRun(
      `console.log(process.env.REGION === "eu-west-1", process.env.API_KEY === ${JSON.stringify(OTHER)}, process.env.PORT)`,
      ["--file", ".env.production"],
    );
    expect(stdout).toBe("true true 1\n");
  });

  it("says when the local file is not here, and how to get it", async () => {
    await expect(run(parseArgs(["run", "--file", "prod.env", "--", "true"]), env, cwd, prompt, deps)).rejects.toMatchObject({
      code: "not_found",
      message: "Can't read config/.env.production here.",
      next: [{ command: "klef pull" }, { command: "klef run --from-vault -- <command>" }],
    });
  });

  it("decrypts the vault's copy with --from-vault, writing nothing", async () => {
    const before = await readdir(cwd);
    const code = await klefRun(
      `console.log(process.env.API_KEY === ${JSON.stringify(VAULT_SECRET)}, process.env.PORT)`,
      ["--from-vault"],
    );
    expect(code).toBe(0);
    expect(stdout).toBe("true 4000\n");
    expect(await readdir(cwd)).toEqual(before);
  });

  it("merges every file with --all, the later file winning", async () => {
    await mkdir(path.join(cwd, "config"));
    await writeFile(path.join(cwd, "config/.env.production"), "REGION=us-east-1\n");
    await klefRun(
      `console.log(process.env.PORT, process.env.REGION === "us-east-1", process.env.API_KEY === ${JSON.stringify(OTHER)})`,
      ["--all"],
    );
    expect(stdout).toBe("3000 true true\n");
  });

  it("passes only the keys --only names", async () => {
    await klefRun(`console.log(process.env.PORT, process.env.API_KEY === undefined, process.env.KEEP)`, ["--only", "PORT"]);
    expect(stdout).toBe("3000 true from-parent\n");
  });

  it("refuses --only names the file does not have, naming them and nothing else", async () => {
    await expect(run(parseArgs(["run", "--only", "PORT,NOPE", "--", "true"]), env, cwd, prompt, deps)).rejects.toMatchObject({
      code: "not_found",
      message: "Not in .env.local: NOPE.",
    });
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
        files: [{ file: ".env.local", source: "local", variables: 5 }],
        variables: 5,
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

  it("prints nothing of its own under --quiet", async () => {
    setUiMode({ quiet: true });
    await klefRun("");
    expect(console_).toEqual([]);
  });

  it("stops with locked, exit 4, when --from-vault needs an unlock nobody can give", async () => {
    const noTerminal = () => Promise.reject(new NoTerminalError());
    await expect(
      run(parseArgs(["run", "--from-vault", "--", process.execPath, "-e", "console.log('ran')"]), env, cwd, noTerminal, deps),
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

  it("reports a command that does not exist", async () => {
    await expect(run(parseArgs(["run", "--", "klef-no-such-program-xyz"]), env, cwd, prompt, deps)).rejects.toMatchObject({
      code: "not_found",
      message: "klef-no-such-program-xyz: command not found.",
    });
  });
});
