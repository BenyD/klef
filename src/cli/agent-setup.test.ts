import { describe, expect, it } from "vitest";
import {
  BLOCK_END,
  BLOCK_START,
  instructionsBody,
  planSetup,
  targetPath,
  upsertBlock,
  type SetupTarget,
} from "./agent-setup.ts";

// What a new agent session reads before it touches an env file. The rules in
// it are the product: if the never-print rule can drop out, or the commands
// drift from what the CLI accepts, the agent is taught to leak or to fail.

const CLI = "klef";

function plan(targets: SetupTarget[], disk: Record<string, string> = {}, global = false) {
  return planSetup(targets, (p) => disk[p] ?? null, CLI, global);
}

describe("instructionsBody", () => {
  const body = instructionsBody(CLI);

  it("tells the agent never to read or print a secret value", () => {
    expect(body).toMatch(/Never read a secret value/);
    expect(body).toMatch(/never echo a variable's value/i);
    expect(body).toMatch(/Never ask the user for their master passphrase/);
  });

  it("covers status, run, pull --all, push --all, and unlock", () => {
    for (const sub of ["status", "run -- npm run dev", "run -- <command>", "run --from-vault -- pnpm test", "pull --all", "push --all --yes", "unlock", "list --json"]) {
      expect(body).toContain(`${CLI} ${sub}`);
    }
  });

  it("explains where the synced files are listed", () => {
    expect(body).toContain(".klef.json");
    expect(body).toMatch(/`files` list/);
  });

  it("uses the invocation it is given, so npx users get npx", () => {
    const npx = instructionsBody("npx @klefsh/cli");
    expect(npx).toContain("npx @klefsh/cli pull --all");
    expect(npx).not.toMatch(/(^|[\s`])klef (pull|push|status|unlock|run)/m);
  });

  // The platforms are audited, never written: an agent that copied a value
  // to Vercel would have read it first.
  it("treats deploy platforms as a read-only audit of names", () => {
    expect(body).toMatch(/audits them, read-only/);
    expect(body).toMatch(/ask the\s+user whether each one is still needed/);
    expect(body).toMatch(/Never copy a value between places/);
  });

  it("uses no em dashes", () => {
    expect(body).not.toContain("—");
  });

  it("never inlines anything that looks like a value", () => {
    expect(body).not.toMatch(/sk_live_|sk_test_|-----BEGIN|=\S/);
  });
});

describe("upsertBlock", () => {
  it("creates the block in an empty file", () => {
    const out = upsertBlock(null, CLI);
    expect(out.startsWith(BLOCK_START)).toBe(true);
    expect(out.endsWith(`${BLOCK_END}\n`)).toBe(true);
  });

  it("appends after the user's own content, leaving it untouched", () => {
    const mine = "# My project\n\nUse pnpm.\n";
    const out = upsertBlock(mine, CLI);
    expect(out.startsWith(`${mine}\n${BLOCK_START}`)).toBe(true);
  });

  it("replaces only its own block, in place", () => {
    const before = "# Top\n";
    const after = "\n## Bottom\nkeep me\n";
    const stale = `${before}${BLOCK_START}\nold instructions\n${BLOCK_END}${after}`;
    const out = upsertBlock(stale, CLI);
    expect(out.startsWith(`${before}${BLOCK_START}`)).toBe(true);
    expect(out.endsWith(`${BLOCK_END}${after}`)).toBe(true);
    expect(out).not.toContain("old instructions");
    expect(out.split(BLOCK_START)).toHaveLength(2);
  });

  it("is idempotent", () => {
    const once = upsertBlock("# Notes\n", CLI);
    expect(upsertBlock(once, CLI)).toBe(once);
  });
});

describe("planSetup", () => {
  it("creates the Claude Code skill and Cursor rule where those tools look", () => {
    const out = plan(["claude", "cursor"]);
    expect(out.map((p) => [p.path, p.action])).toEqual([
      [".claude/skills/klef/SKILL.md", "create"],
      [".cursor/rules/klef.mdc", "create"],
    ]);
  });

  it("gives the skill frontmatter Claude Code can discover it by", () => {
    const skill = plan(["claude"])[0]!.contents!;
    expect(skill).toMatch(/^---\nname: klef\ndescription: .+\n---\n/);
  });

  it("makes the Cursor rule always apply", () => {
    const rule = plan(["cursor"])[0]!.contents!;
    expect(rule).toMatch(/^---\ndescription: .+\nglobs:\nalwaysApply: true\n---\n/);
  });

  it("reports nothing to do when run a second time", () => {
    const first = plan(["claude", "cursor", "claude-md", "agents"]);
    const disk = Object.fromEntries(first.map((p) => [p.path, p.contents!]));
    const second = plan(["claude", "cursor", "claude-md", "agents"], disk);
    expect(second.every((p) => p.action === "unchanged" && p.contents === null)).toBe(true);
  });

  it("updates a skill it wrote earlier", () => {
    const disk = { ".claude/skills/klef/SKILL.md": `---\nname: klef\n---\n${BLOCK_START}\nold\n${BLOCK_END}\n` };
    expect(plan(["claude"], disk)[0]!.action).toBe("update");
  });

  // A file at our path that we did not write is someone's own work.
  it("refuses to overwrite a file it does not own", () => {
    const disk = { ".cursor/rules/klef.mdc": "my own rule\n" };
    const [item] = plan(["cursor"], disk);
    expect(item).toMatchObject({ action: "conflict", contents: null });
  });

  it("merges into an existing CLAUDE.md rather than replacing it", () => {
    const disk = { "CLAUDE.md": "# House rules\n" };
    const [item] = plan(["claude-md"], disk);
    expect(item!.action).toBe("update");
    expect(item!.contents!.startsWith("# House rules\n")).toBe(true);
  });

  it("puts a global install under ~/.claude", () => {
    expect(targetPath("claude", true).path).toBe(".claude/skills/klef/SKILL.md");
    expect(targetPath("claude-md", true).path).toBe(".claude/CLAUDE.md");
    expect(targetPath("claude-md", false).path).toBe("CLAUDE.md");
  });
});
