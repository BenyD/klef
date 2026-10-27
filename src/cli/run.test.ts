import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptBlob, setupVault, type VaultSetupResult } from "../shared/crypto.ts";
import { parseArgs } from "./args.ts";
import { run } from "./commands/run.ts";
import { resetUi, setUiMode } from "./ui.ts";

// `klef run` against a real child process (node), which writes what it saw to
// a file: the variables, decoded; the exit code; stdin. klef's own output is
// captured and must never hold a value.

const SECRET = "sk_live_do_not_print_me";
const PASSPHRASE = "correct horse battery staple";

let vault: VaultSetupResult;
let cwd: string;
let out: string;
let env: NodeJS.ProcessEnv;
let output: string[];

beforeAll(async () => {
  vault = await setupVault(PASSPHRASE);
});

beforeEach(async () => {
  cwd = await mkdtemp(path.join(tmpdir(), "klef-run-"));
  out = path.join(cwd, "seen.json");
  env = { PATH: process.env.PATH, KEEP: "from-parent", KLEF_CONFIG_DIR: path.join(cwd, ".config"), KLEF_AGENT_SOCK: path.join(cwd, "a.sock") };
  await writeFile(
    path.join(cwd, ".klef.json"),
    JSON.stringify({ workspace: "W", project: "P", file: ".env.local", environment: null, files: [{ file: ".env.local" }, { file: "prod.env", path: "config/.env.production" }] }),
  );
  await writeFile(path.join(cwd, ".env.local"), `# App\nAPI_KEY="${SECRET} # not a comment"\nPORT=3000 # comment\nEMPTY=\n`);
  output = [];
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

/** A node one-liner that records its environment and exits with `code`. */
function child(code = 0, extra = "") {
  return [
    "--",
    process.execPath,
    "-e",
    `const fs=require("fs");${extra}fs.writeFileSync(${JSON.stringify(out)},JSON.stringify(process.env));process.exit(${code})`,
  ];
}

const seen = async () => JSON.parse(await readFile(out, "utf8")) as Record<string, string>;

describe("klef run", () => {
  it("passes the local file's variables, decoded, and the parent's environment", async () => {
    expect(await run(parseArgs(["run", ...child()]), env, cwd)).toBe(0);
    const vars = await seen();
    expect(vars.API_KEY).toBe(`${SECRET} # not a comment`);
    expect(vars.PORT).toBe("3000");
    expect(vars.EMPTY).toBe("");
    expect(vars.KEEP).toBe("from-parent");
    expect(output).toEqual(["klef: 3 variables from .env.local"]);
  });

  it("returns the command's exit code", async () => {
    expect(await run(parseArgs(["run", ...child(7)]), env, cwd)).toBe(7);
  });

  it("passes only the keys --only names", async () => {
    await run(parseArgs(["run", "--only", "PORT", ...child()]), env, cwd);
    const vars = await seen();
    expect(vars.PORT).toBe("3000");
    expect(vars.API_KEY).toBeUndefined();
  });

  it("refuses --only names the file does not have, naming them and nothing else", async () => {
    await expect(run(parseArgs(["run", "--only", "PORT,NOPE", ...child()]), env, cwd)).rejects.toMatchObject({
      code: "not_found",
      message: "Not in .env.local: NOPE.",
    });
  });

  it("reads another listed file at its local path", async () => {
    await writeFile(path.join(cwd, "config-missing"), "");
    await expect(run(parseArgs(["run", "--file", "prod.env", ...child()]), env, cwd)).rejects.toThrow(
      "Can't read config/.env.production here.",
    );
  });

  it("decrypts the vault's copy with --from-vault", async () => {
    const blob = await encryptBlob(vault.dek, `API_KEY=${SECRET}_vault\n`);
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = new URL(String(input));
      const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { "content-type": "application/json" } });
      if (url.pathname === "/api/tree") {
        return json({ workspaces: [{ id: "w", name: "W", icon: null, createdAt: "", projects: [{ id: "p", name: "P", framework: null, icon: null, createdAt: "", files: [{ id: "f", name: ".env.local", currentVersionId: "v1", environment: null, createdAt: "" }] }] }] });
      }
      if (url.pathname === "/api/files/f/current") return json({ version: { id: "v1", blob, createdAt: "" } });
      if (url.pathname === "/api/vault") return json({ exists: true, keyMaterial: vault.keyMaterial });
      return new Response("nope", { status: 404 });
    });
    const withToken = { ...env, KLEF_TOKEN: "klef_pat_x", KLEF_API_URL: "https://klef.test", KLEF_NO_KEYCHAIN: "1" };
    expect(await run(parseArgs(["run", "--from-vault", ...child()]), withToken, cwd, async () => PASSPHRASE)).toBe(0);
    expect((await seen()).API_KEY).toBe(`${SECRET}_vault`);
  });

  it("says what is missing without a command, or with --json", async () => {
    await expect(run(parseArgs(["run"]), env, cwd)).rejects.toMatchObject({ code: "usage" });
    setUiMode({ json: true }, "run");
    await expect(run(parseArgs(["run", ...child()]), env, cwd)).rejects.toThrow(/no --json/);
  });

  it("reports a command that does not exist", async () => {
    await expect(run(parseArgs(["run", "--", "klef-no-such-command-xyz"]), env, cwd)).rejects.toThrow(
      "klef-no-such-command-xyz: command not found.",
    );
  });

  it("prints nothing of its own under --quiet", async () => {
    setUiMode({ quiet: true });
    await run(parseArgs(["run", ...child()]), env, cwd);
    expect(output).toEqual([]);
  });
});
