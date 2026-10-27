import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "./args.ts";
import { setup, type SetupDeps } from "./commands/setup.ts";
import { NoTerminalError } from "./prompt.ts";
import type { VaultTree } from "../shared/api-types.ts";

// `klef setup` against real directories and a stand-in account: what it
// writes, what it refuses to write, that nothing lands without a yes, and
// that an agent running it is told what to hand the user rather than stuck.

let cwd: string;
let home: string;
let output: string[];

beforeEach(async () => {
  cwd = await mkdtemp(path.join(tmpdir(), "klef-setup-cwd-"));
  home = await mkdtemp(path.join(tmpdir(), "klef-setup-home-"));
  output = [];
  const record = (...parts: unknown[]) => void output.push(parts.join(" "));
  vi.spyOn(console, "log").mockImplementation(record);
  vi.spyOn(console, "error").mockImplementation(record);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(cwd, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

const yes = async () => true;
const no = async () => false;

function deps(overrides: Partial<SetupDeps> = {}): SetupDeps {
  return {
    home,
    ask: yes,
    line: async () => "1",
    account: async () => ({ email: "me@example.com", tree: TREE }),
    login: async () => 0,
    unlock: async () => 0,
    pullFile: async (_file, localPath) => {
      await writeFile(path.join(cwd, localPath), "# pulled\n");
      return 0;
    },
    ...overrides,
  };
}

function run(argv: string, ask: (q: string) => Promise<boolean> = yes, more: Partial<SetupDeps> = {}) {
  return setup(parseArgs(argv.split(" ").filter(Boolean)), cwd, deps({ ask, ...more }));
}

function project(name: string, files: string[]) {
  return {
    id: name,
    name,
    framework: null,
    icon: null,
    createdAt: "",
    files: files.map((f) => ({ id: f, name: f, environment: null, currentVersionId: "v1" })),
  };
}

const TREE = {
  workspaces: [
    {
      id: "w",
      name: "Personal",
      icon: null,
      createdAt: "",
      projects: [
        project("lensdrop", [".env.production", ".env.local"]),
        project("empty", []),
        project("blog", [".env"]),
      ],
    },
  ],
} as unknown as VaultTree;

const NO_TERMINAL = async (): Promise<never> => {
  throw new NoTerminalError();
};

async function exists(file: string): Promise<boolean> {
  return readFile(file).then(() => true, () => false);
}

describe("klef setup <targets>", () => {
  it("writes the Claude Code skill and Cursor rule by default, after a yes", async () => {
    const ask = vi.fn(yes);
    expect(await run("setup claude cursor", ask)).toBe(0);
    expect(ask).toHaveBeenCalledWith("Write 2 files?");
    expect(await readFile(path.join(cwd, ".claude/skills/klef/SKILL.md"), "utf8")).toMatch(/^---\nname: klef/);
    expect(await readFile(path.join(cwd, ".cursor/rules/klef.mdc"), "utf8")).toMatch(/alwaysApply: true/);
  });

  it("writes nothing when the answer is no", async () => {
    expect(await run("setup claude", no)).toBe(1);
    expect(await exists(path.join(cwd, ".claude/skills/klef/SKILL.md"))).toBe(false);
  });

  // An agent has no terminal to answer on. It should be told to ask in chat
  // and rerun with --yes, not handed the generic terminal error.
  it("tells an agent with no terminal how to proceed once the user agrees", async () => {
    await expect(run("setup cursor", NO_TERMINAL)).rejects.toMatchObject({
      code: "confirmation_required",
      exitCode: 2,
      next: [{ command: "klef setup cursor --yes" }],
    });
    expect(await exists(path.join(cwd, ".cursor/rules/klef.mdc"))).toBe(false);
  });

  it("skips the question with --yes", async () => {
    const ask = vi.fn(no);
    expect(await run("setup claude --yes", ask)).toBe(0);
    expect(ask).not.toHaveBeenCalled();
    expect(await exists(path.join(cwd, ".claude/skills/klef/SKILL.md"))).toBe(true);
  });

  it("is a no-op the second time, without asking", async () => {
    await run("setup all --yes");
    const ask = vi.fn(yes);
    output = [];
    expect(await run("setup all", ask)).toBe(0);
    expect(ask).not.toHaveBeenCalled();
    expect(output.at(-1)).toBe("     Nothing to write.");
  });

  it("keeps the user's own CLAUDE.md and AGENTS.md content", async () => {
    await writeFile(path.join(cwd, "CLAUDE.md"), "# House rules\nUse pnpm.\n");
    expect(await run("setup claude-md agents --yes")).toBe(0);
    const claude = await readFile(path.join(cwd, "CLAUDE.md"), "utf8");
    expect(claude.startsWith("# House rules\nUse pnpm.\n")).toBe(true);
    expect(claude).toContain("klef:start");
    expect(await readFile(path.join(cwd, "AGENTS.md"), "utf8")).toContain("klef:start");
  });

  it("leaves a rule it did not write alone", async () => {
    await mkdir(path.join(cwd, ".cursor/rules"), { recursive: true });
    await writeFile(path.join(cwd, ".cursor/rules/klef.mdc"), "mine\n");
    expect(await run("setup cursor --yes")).toBe(1);
    expect(await readFile(path.join(cwd, ".cursor/rules/klef.mdc"), "utf8")).toBe("mine\n");
    expect(output.join("\n")).toMatch(/not written by klef/);
  });

  it("installs the skill for every project with --global", async () => {
    await expect(run("setup --global --yes")).rejects.toThrow(/cursor can only be set up per project/);

    expect(await run("setup claude --global --yes")).toBe(0);
    expect(await exists(path.join(home, ".claude/skills/klef/SKILL.md"))).toBe(true);
    expect(await exists(path.join(cwd, ".claude"))).toBe(false);
  });

  it("rejects a target it does not know", async () => {
    await expect(run("setup vscode --yes")).rejects.toMatchObject({
      code: "usage",
      message: expect.stringMatching(/Unknown target "vscode"/),
    });
  });
});

describe("klef setup (everything)", () => {
  it("signs in, links the whole project, writes agent files, unlocks, and pulls", async () => {
    let signedIn = false;
    const login = vi.fn(async () => {
      signedIn = true;
      return 0;
    });
    const unlock = vi.fn(async () => 0);
    const pulled: string[] = [];
    const code = await run("setup", yes, {
      account: async () => (signedIn ? { email: "me@example.com", tree: TREE } : null),
      login,
      unlock,
      pullFile: async (file, localPath) => {
        pulled.push(`${file}->${localPath}`);
        return 0;
      },
    });

    expect(code).toBe(0);
    expect(login).toHaveBeenCalledOnce();
    const config = JSON.parse(await readFile(path.join(cwd, ".klef.json"), "utf8"));
    expect(config).toMatchObject({
      workspace: "Personal",
      project: "lensdrop",
      file: ".env.local",
      files: [
        { file: ".env.production", path: ".env.production" },
        { file: ".env.local", path: ".env.local" },
      ],
    });
    expect(await exists(path.join(cwd, ".claude/skills/klef/SKILL.md"))).toBe(true);
    expect(await exists(path.join(cwd, ".cursor/rules/klef.mdc"))).toBe(true);
    expect(unlock).toHaveBeenCalledOnce();
    expect(pulled).toEqual([".env.production->.env.production", ".env.local->.env.local"]);
  });

  it("skips every finished step on a second run, and never overwrites a local file", async () => {
    expect(await run("setup")).toBe(0);
    const unlock = vi.fn(async () => 0);
    const pullFile = vi.fn(async () => 0);
    const login = vi.fn(async () => 0);
    expect(await run("setup", yes, { unlock, pullFile, login })).toBe(0);
    expect(login).not.toHaveBeenCalled();
    expect(unlock).not.toHaveBeenCalled();
    expect(pullFile).not.toHaveBeenCalled();
  });

  it("pulls only the files that are not on disk yet", async () => {
    await writeFile(path.join(cwd, ".env.local"), "# mine, with unsaved edits\n");
    const pulled: string[] = [];
    await run("setup", yes, {
      pullFile: async (file) => {
        pulled.push(file);
        return 0;
      },
    });
    expect(pulled).toEqual([".env.production"]);
    expect(await readFile(path.join(cwd, ".env.local"), "utf8")).toBe("# mine, with unsaved edits\n");
  });

  it("offers a menu when there is more than one project", async () => {
    const line = vi.fn(async () => "2");
    expect(await run("setup", yes, { line })).toBe(0);
    expect(output.join("\n")).toContain("1. Personal / lensdrop (.env.production, .env.local)");
    // Projects with no files are not offered.
    expect(output.join("\n")).not.toContain("empty");
    expect(JSON.parse(await readFile(path.join(cwd, ".klef.json"), "utf8")).project).toBe("blog");
  });

  it("links the project --project names, without a menu", async () => {
    const line = vi.fn(async () => "1");
    expect(await run("setup --project BLOG", yes, { line })).toBe(0);
    expect(line).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(path.join(cwd, ".klef.json"), "utf8")).file).toBe(".env");
  });

  // Run by an agent: every step that needs the user says what to hand them.
  it("tells an agent to ask the user which project", async () => {
    await expect(run("setup", yes, { line: NO_TERMINAL })).rejects.toMatchObject({
      code: "confirmation_required",
      next: [{ command: "klef setup --workspace <workspace> --project <project>" }],
    });
    expect(await exists(path.join(cwd, ".klef.json"))).toBe(false);
  });

  it("hands the passphrase step to the user when an agent runs it", async () => {
    const pullFile = vi.fn(async () => 0);
    await expect(
      run("setup --project lensdrop --yes", NO_TERMINAL, { unlock: NO_TERMINAL, pullFile }),
    ).rejects.toMatchObject({
      code: "locked",
      exitCode: 4,
      next: [{ command: "klef login" }, { command: "klef unlock" }, { command: "klef pull --all" }],
    });
    // Agent files went in, because --yes says the user already agreed.
    expect(await exists(path.join(cwd, ".claude/skills/klef/SKILL.md"))).toBe(true);
    expect(pullFile).not.toHaveBeenCalled();
  });

  it("stops when the vault has nothing to link", async () => {
    const account = async () => ({ email: "me@example.com", tree: { workspaces: [] } });
    await expect(run("setup", yes, { account })).rejects.toThrow(/no env files yet/);
  });
});
