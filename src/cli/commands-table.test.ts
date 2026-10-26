import { describe, expect, it } from "vitest";
import {
  commandHelp,
  COMMANDS,
  completionScript,
  findCommand,
  GLOBAL_FLAGS,
  rootHelp,
  suggest,
  topicHelp,
  TOPICS,
  unknownFlag,
} from "./commands-table.ts";

describe("the command table", () => {
  it("names every command once, with a summary, an example and a JSON shape", () => {
    const names = COMMANDS.flatMap((c) => [c.name, ...(c.aliases ?? [])]);
    expect(new Set(names).size).toBe(names.length);
    for (const c of COMMANDS) {
      expect(c.summary.length).toBeGreaterThan(0);
      expect(c.examples.length).toBeGreaterThan(0);
      expect(c.json.length).toBeGreaterThan(0);
    }
  });

  it("finds a command by alias", () => {
    expect(findCommand("ls")?.name).toBe("list");
    expect(findCommand("nope")).toBeUndefined();
  });

  it("has no em dashes anywhere a user reads", () => {
    const all = [rootHelp("klef", "1.0.0"), ...COMMANDS.map((c) => commandHelp(c, "klef")), ...TOPICS.map((t) => topicHelp(t, "klef"))];
    for (const text of all) expect(text).not.toContain("—");
  });

  it("keeps help within 100 columns", () => {
    for (const c of COMMANDS) {
      for (const line of commandHelp(c, "klef").split("\n")) {
        if (!line.startsWith("  {") && !line.includes("action:") && !line.includes("status:")) {
          expect(line.length, line).toBeLessThanOrEqual(100);
        }
      }
    }
  });
});

describe("help", () => {
  it("shows examples in the user's own invocation", () => {
    const help = commandHelp(findCommand("pull")!, "npx @klefsh/cli");
    expect(help).toContain("$ npx @klefsh/cli pull --all");
    expect(help).not.toMatch(/\$ klef /);
  });

  it("lists the global flags and the help topics at the root", () => {
    const root = rootHelp("klef", "1.2.3");
    expect(root).toMatch(/^klef 1\.2\.3/);
    for (const f of GLOBAL_FLAGS) expect(root).toContain(`--${f.name}`);
    for (const t of TOPICS) expect(root).toContain(`klef help ${t}`);
  });

  it("documents every exit code ui.ts uses", () => {
    const text = topicHelp("exit-codes", "klef");
    for (const code of ["0", "1", "2", "3", "4", "5", "6", "10", "130"]) expect(text).toMatch(new RegExp(`^  ${code} `, "m"));
  });
});

describe("unknownFlag", () => {
  const pull = findCommand("pull")!;

  it("accepts a command's own flags, global ones, and -v", () => {
    expect(unknownFlag(pull, ["file", "all", "json", "yes", "quiet", "cwd", "v"])).toBeNull();
  });

  it("names a flag the command does not take, with a suggestion", () => {
    expect(unknownFlag(pull, ["fiel"])).toEqual({ flag: "fiel", suggestion: "file" });
    expect(unknownFlag(pull, ["dry-run"])).toEqual({ flag: "dry-run", suggestion: null });
  });
});

describe("suggest", () => {
  it("catches typos and prefixes, and nothing far off", () => {
    expect(suggest("pul", ["pull", "push"])).toBe("pull");
    expect(suggest("stauts", ["status", "setup"])).toBe("status");
    expect(suggest("xyz", ["pull", "push"])).toBeNull();
  });
});

describe("completionScript", () => {
  it("covers every command in every shell", () => {
    for (const shell of ["bash", "zsh", "fish"] as const) {
      const script = completionScript(shell);
      for (const c of COMMANDS) expect(script).toContain(c.name);
      expect(script).toMatch(shell === "fish" ? /-l json\b/ : /--json\b/);
    }
  });

  it("knows a command's own flags", () => {
    expect(completionScript("bash")).toMatch(/pull\) opts="--file --path --all /);
    expect(completionScript("fish")).toContain("__fish_seen_subcommand_from sync' -l dry-run");
  });
});
