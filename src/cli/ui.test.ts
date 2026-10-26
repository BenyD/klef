import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canConfirm,
  CliError,
  colorFor,
  detectAgent,
  done,
  emit,
  modeFor,
  nested,
  note,
  reportError,
  resetUi,
  say,
  setUiMode,
  warn,
} from "./ui.ts";

let stdout: string[];
let stderr: string[];

beforeEach(() => {
  stdout = [];
  stderr = [];
  vi.spyOn(console, "log").mockImplementation((...p: unknown[]) => void stdout.push(p.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...p: unknown[]) => void stderr.push(p.join(" ")));
});

afterEach(() => {
  vi.restoreAllMocks();
  resetUi();
});

const flags = { json: false, quiet: false, noInput: false, noColor: false };
const tty = { stdoutTty: true, stderrTty: true };

describe("colorFor", () => {
  it("follows the terminal by default", () => {
    expect(colorFor(true, {}, false)).toBe(true);
    expect(colorFor(false, {}, false)).toBe(false);
  });

  it("honours NO_COLOR, CLICOLOR=0, TERM=dumb and --no-color", () => {
    expect(colorFor(true, { NO_COLOR: "1" }, false)).toBe(false);
    expect(colorFor(true, { CLICOLOR: "0" }, false)).toBe(false);
    expect(colorFor(true, { TERM: "dumb" }, false)).toBe(false);
    expect(colorFor(true, {}, true)).toBe(false);
  });

  it("lets FORCE_COLOR override the terminal either way", () => {
    expect(colorFor(false, { FORCE_COLOR: "1" }, false)).toBe(true);
    expect(colorFor(true, { FORCE_COLOR: "0" }, false)).toBe(false);
    expect(colorFor(false, { CLICOLOR_FORCE: "1" }, false)).toBe(true);
  });

  it("treats an empty NO_COLOR as unset, as the convention says", () => {
    expect(colorFor(true, { NO_COLOR: "" }, false)).toBe(true);
  });
});

describe("modeFor", () => {
  it("turns prompts off under --no-input, KLEF_NO_INPUT and CI", () => {
    expect(modeFor(flags, {}, tty).input).toBe(true);
    expect(modeFor({ ...flags, noInput: true }, {}, tty).input).toBe(false);
    expect(modeFor(flags, { KLEF_NO_INPUT: "1" }, tty).input).toBe(false);
    expect(modeFor(flags, { CI: "true" }, tty).input).toBe(false);
    expect(modeFor(flags, { CI: "false" }, tty).input).toBe(true);
  });

  it("never colours stdout under --json", () => {
    expect(modeFor({ ...flags, json: true }, { FORCE_COLOR: "1" }, tty).color.stdout).toBe(false);
  });

  it("falls back to ASCII symbols without UTF-8", () => {
    expect(modeFor(flags, { LANG: "C" }, tty).unicode).toBe(false);
    expect(modeFor(flags, { LANG: "en_GB.UTF-8" }, tty).unicode).toBe(true);
  });
});

describe("detectAgent", () => {
  it("knows the agents' marker variables", () => {
    expect(detectAgent({ CLAUDECODE: "1" })).toBe(true);
    expect(detectAgent({ CURSOR_AGENT: "1" })).toBe(true);
    expect(detectAgent({ CLAUDECODE: "0" })).toBe(false);
    expect(detectAgent({})).toBe(false);
  });
});

describe("canConfirm", () => {
  it("asks only a person who can answer", () => {
    setUiMode({});
    expect(canConfirm()).toBe(true);
    for (const mode of [{ json: true }, { input: false }, { agent: true }]) {
      setUiMode(mode);
      expect(canConfirm()).toBe(false);
    }
  });
});

describe("streams", () => {
  it("puts results on stdout and everything else on stderr", () => {
    setUiMode({});
    say("result");
    done("finished");
    note("hint");
    warn("careful");
    expect(stdout).toEqual(["result", "✓ finished"]);
    expect(stderr).toEqual(["hint", "! careful"]);
  });

  it("keeps only finished steps and warnings under --quiet", () => {
    setUiMode({ quiet: true });
    say("result");
    done("finished");
    note("hint");
    warn("careful");
    expect(stdout).toEqual(["✓ finished"]);
    expect(stderr).toEqual(["! careful"]);
  });

  it("uses ASCII symbols when unicode is off", () => {
    setUiMode({ unicode: false });
    done("finished");
    expect(stdout).toEqual(["ok finished"]);
  });

  it("colours only when the mode says so", () => {
    setUiMode({ color: { stdout: true, stderr: false } });
    done("x");
    expect(stdout[0]).toBe("\x1b[32m✓\x1b[39m x");
  });
});

describe("JSON", () => {
  it("prints one envelope for a result, with warnings, and nothing else", () => {
    setUiMode({ json: true }, "pull");
    say("ignored");
    note("ignored");
    warn("deprecated thing", "deprecated");
    emit({ files: [] });
    emit({ second: true });
    expect(stderr).toEqual([]);
    expect(stdout).toHaveLength(1);
    expect(JSON.parse(stdout[0]!)).toEqual({
      schema: 1,
      ok: true,
      command: "pull",
      data: { files: [] },
      warnings: [{ code: "deprecated", message: "deprecated thing" }],
    });
  });

  it("prints an error as an envelope with code, next and exit", () => {
    setUiMode({ json: true }, "pull");
    const code = reportError(new CliError("locked", "Locked.", { hint: "Ask.", next: ["klef unlock"] }));
    expect(code).toBe(4);
    expect(JSON.parse(stdout[0]!)).toEqual({
      schema: 1,
      ok: false,
      command: "pull",
      error: { code: "locked", message: "Locked.", hint: "Ask.", next: [{ command: "klef unlock" }] },
      exit: 4,
      warnings: [],
    });
  });

  it("carries what a command found before it stopped", () => {
    setUiMode({ json: true }, "sync");
    reportError(new CliError("conflict", "Both changed.", { data: { files: [{ file: ".env" }] } }));
    expect(JSON.parse(stdout[0]!).data).toEqual({ files: [{ file: ".env" }] });
  });

  it("lets only the outer command emit", async () => {
    setUiMode({ json: true }, "setup");
    await nested(async () => emit({ inner: true }));
    emit({ outer: true });
    expect(stdout.map((l) => JSON.parse(l).data)).toEqual([{ outer: true }]);
  });
});

describe("reportError", () => {
  it("prints the message, hint and next steps on stderr", () => {
    setUiMode({});
    const code = reportError(
      new CliError("not_linked", "Not linked.", { hint: "Link it:", next: [{ command: "klef link", description: "pick a project" }] }),
    );
    expect(code).toBe(6);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual(["✗ Not linked.", "  Link it:", "  Run: klef link  (pick a project)"]);
  });

  it("redacts an assignment that slipped into a message", () => {
    setUiMode({});
    reportError(new Error("bad line\nAPI_KEY=sk_live_secret"));
    expect(stderr.join("\n")).not.toContain("sk_live_secret");
  });

  it("treats anything unexpected as internal, exit 1", () => {
    setUiMode({});
    expect(reportError(new Error("boom"))).toBe(1);
  });
});
