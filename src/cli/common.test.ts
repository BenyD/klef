import { afterEach, describe, expect, it } from "vitest";
import { parseArgs } from "./args.ts";
import { confirmOrFail, rerun, shellArg } from "./common.ts";
import { NoTerminalError } from "./prompt.ts";
import { resetUi, setUiMode } from "./ui.ts";

afterEach(() => resetUi());

const yes = () => Promise.resolve(true);
const noTerminal = () => Promise.reject(new NoTerminalError());

describe("rerun", () => {
  it("repeats the invocation with the extra flag, quoting only what needs it", () => {
    const args = parseArgs(["push", "--file", "my file.env", "--all", "--json"]);
    expect(rerun("push", args, ["--yes"])).toBe("klef push --file 'my file.env' --all --json --yes");
  });

  it("does not add a flag twice", () => {
    expect(rerun("sync", parseArgs(["sync", "--yes"]), ["--yes"])).toBe("klef sync --yes");
  });

  it("leaves simple names bare", () => {
    expect(shellArg(".env.local")).toBe(".env.local");
    expect(shellArg("Beny's Team")).toBe("'Beny'\\''s Team'");
  });
});

describe("confirmOrFail", () => {
  it("is answered by --yes without asking", async () => {
    const ask = () => Promise.reject(new Error("asked"));
    expect(await confirmOrFail("Push?", "push", parseArgs(["push", "-y"]), ask)).toBe(true);
  });

  it("asks a person at a terminal", async () => {
    setUiMode({});
    expect(await confirmOrFail("Push?", "push", parseArgs(["push"]), () => Promise.resolve(false))).toBe(false);
  });

  // The non-interactive paths: each one fails fast with the command to rerun,
  // rather than hanging on a prompt nobody will see.
  for (const [label, mode] of [
    ["--json", { json: true }],
    ["--no-input or CI", { input: false }],
    ["a coding agent", { agent: true }],
  ] as const) {
    it(`fails fast under ${label}, without asking`, async () => {
      setUiMode(mode);
      const ask = () => Promise.reject(new Error("asked"));
      await expect(confirmOrFail("Push 2 files?", "push", parseArgs(["push", "--all"]), ask)).rejects.toMatchObject({
        code: "confirmation_required",
        exitCode: 2,
        next: [{ command: "klef push --all --yes" }],
      });
    });
  }

  it("fails the same way when there turns out to be no terminal", async () => {
    setUiMode({});
    await expect(confirmOrFail("Push?", "push", parseArgs(["push"]), noTerminal)).rejects.toMatchObject({
      code: "confirmation_required",
    });
    expect(await confirmOrFail("Push?", "push", parseArgs(["push"]), yes)).toBe(true);
  });
});
