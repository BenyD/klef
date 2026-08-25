import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENT_PROMPTS,
  DEFAULT_PROMPT,
  pnpmScriptsIn,
  promptText,
  SECRET_SAFETY_RULE,
} from "./agent-prompts.ts";

const packageScripts = Object.keys(
  (
    JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> }
  ).scripts,
);

describe("agent prompts", () => {
  it("offers distinct, non-empty prompts", () => {
    expect(AGENT_PROMPTS.length).toBeGreaterThan(0);
    expect(new Set(AGENT_PROMPTS.map((p) => p.id)).size).toBe(AGENT_PROMPTS.length);

    for (const prompt of AGENT_PROMPTS) {
      expect(prompt.label.trim()).not.toBe("");
      expect(prompt.description.trim()).not.toBe("");
      expect(prompt.body.trim().length).toBeGreaterThan(50);
    }
  });

  // The point of shipping these at all is that an agent following one won't
  // leak a secret. If a prompt can be added without the rule, that guarantee
  // is only a convention.
  it("carries the secret-safety rule on every prompt", () => {
    for (const prompt of AGENT_PROMPTS) {
      expect(promptText(prompt)).toContain(SECRET_SAFETY_RULE);
    }
  });

  it("puts the safety rule last, where it isn't buried in the steps", () => {
    for (const prompt of AGENT_PROMPTS) {
      expect(promptText(prompt).endsWith(SECRET_SAFETY_RULE)).toBe(true);
    }
  });

  // A landing page that hands out a command which doesn't exist is worse than
  // one that hands out nothing.
  it("only references pnpm scripts this repo actually defines", () => {
    for (const prompt of AGENT_PROMPTS) {
      for (const script of pnpmScriptsIn(prompt.body)) {
        expect(packageScripts, `${prompt.id} references "pnpm ${script}"`).toContain(
          script,
        );
      }
    }
  });

  it("has a default prompt that is one of the offered prompts", () => {
    expect(AGENT_PROMPTS).toContain(DEFAULT_PROMPT);
  });

  it("never inlines a value that looks like a real secret", () => {
    for (const prompt of AGENT_PROMPTS) {
      expect(promptText(prompt)).not.toMatch(/sk_live_|sk_test_|-----BEGIN/);
    }
  });
});

describe("pnpmScriptsIn", () => {
  it("finds script references, including colon-separated ones", () => {
    expect(pnpmScriptsIn("run `pnpm build` then `pnpm db:migrate:remote`")).toEqual([
      "build",
      "db:migrate:remote",
    ]);
  });

  it("ignores pnpm builtins, which are not package scripts", () => {
    expect(pnpmScriptsIn("pnpm install && pnpm exec wrangler login")).toEqual([]);
  });

  it("deduplicates repeated references", () => {
    expect(pnpmScriptsIn("pnpm build; pnpm build")).toEqual(["build"]);
  });

  it("finds nothing in text without commands", () => {
    expect(pnpmScriptsIn("no commands here")).toEqual([]);
  });
});
