import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENT_PROMPTS,
  filePullPrompt,
  npxPackagesIn,
  PUBLISHED_PACKAGES,
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

  // The bug this guards against: the self-host prompt used to say "set the
  // production secrets, prompting me for each value", which contradicts the
  // safety rule appended to the same prompt. An agent could only satisfy
  // `wrangler secret put` by holding the plaintext or by asking for it in
  // chat — both of which put a secret in a model's context.
  it("never asks the agent to run an interactive secret command", () => {
    for (const prompt of AGENT_PROMPTS) {
      const text = promptText(prompt);
      if (!text.includes("secret put")) continue;
      expect(text, `${prompt.id} mentions secret put`).toMatch(
        /run myself|run them yourself|do not run them for me/i,
      );
      expect(text, `${prompt.id} must not solicit values`).toMatch(
        /do not ask me for the values/i,
      );
    }
  });

  // pull and push read the master passphrase from the terminal and exit 1 for
  // anything else. A prompt that tells an agent to run one sends it into a
  // refusal it cannot get past, so every mention has to hand the command back.
  it("never asks the agent to run a command that needs the passphrase", () => {
    for (const prompt of AGENT_PROMPTS) {
      const text = promptText(prompt);
      if (!/@klefsh\/cli (pull|push)/.test(text)) continue;
      expect(text, `${prompt.id} mentions pull or push`).toMatch(
        /give me|hand me|hand it over|run myself|run it yourself|wait for me/i,
      );
    }
  });

  it("tells the sync prompt's agent that klef cannot diff yet", () => {
    const sync = AGENT_PROMPTS.find((p) => p.id === "sync");
    expect(sync, "the sync prompt should exist").toBeDefined();
    // Without `diff`, "are these the same?" is unanswerable without opening
    // the file — so the prompt has to say ask, not guess.
    expect(promptText(sync!)).toMatch(/no \\`diff\\` command yet|ask me/i);
  });

  it("checks git tracking rather than trusting .gitignore alone", () => {
    // Being listed in .gitignore and being tracked by git are different
    // things; a file committed before the rule was added still leaks.
    const onboarding = AGENT_PROMPTS.find((p) => p.id === "project");
    expect(onboarding && promptText(onboarding)).toMatch(/git ls-files/);
  });

  // klef.sh shipped a prompt telling people to run @klefsh/cli before the
  // package existed, so every visitor copying it got a 404 on line one. A
  // package only joins PUBLISHED_PACKAGES once it is really on npm.
  it("only tells the reader to run packages that are published", () => {
    for (const prompt of AGENT_PROMPTS) {
      for (const pkg of npxPackagesIn(promptText(prompt))) {
        expect(PUBLISHED_PACKAGES, `${prompt.id} runs ${pkg}`).toContain(pkg);
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

describe("filePullPrompt", () => {
  const target = { workspace: "Beny's Team", project: "Lensdrop", file: ".env.local" };

  it("names the file and links it in one command", () => {
    const out = filePullPrompt(target);
    expect(out).toContain(".env.local");
    expect(out).toContain("npx @klefsh/cli link 'Beny'\\''s Team' 'Lensdrop' '.env.local'");
  });

  it("hands pull back rather than having the agent run it", () => {
    expect(filePullPrompt(target)).toMatch(/give me .*pull.* to run myself/);
  });

  it("carries the secret-safety rule, like every other prompt", () => {
    expect(filePullPrompt(target).endsWith(SECRET_SAFETY_RULE)).toBe(true);
  });

  it("only names packages that are published", () => {
    for (const pkg of npxPackagesIn(filePullPrompt(target))) {
      expect(PUBLISHED_PACKAGES).toContain(pkg);
    }
  });

  it("uses no em dashes", () => {
    expect(filePullPrompt(target)).not.toContain("\u2014");
  });
});
