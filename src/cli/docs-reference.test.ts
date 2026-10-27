import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COMMANDS, GLOBAL_FLAGS, topicHelp } from "./commands-table.ts";

// The docs site's CLI reference is written by hand, so these keep it honest:
// every command and flag the CLI has must be on the page, and the error and
// exit codes must match what `klef help` prints.

const DOCS = path.join(import.meta.dirname, "../../docs-site/content/docs/cli");
const page = (name: string) => readFile(path.join(DOCS, name), "utf8");

/** The text of one `### klef <name>` section. */
function section(markdown: string, name: string): string {
  const start = markdown.indexOf(`### klef ${name}\n`);
  if (start === -1) return "";
  const next = markdown.indexOf("\n### ", start + 1);
  const nextGroup = markdown.indexOf("\n## ", start + 1);
  const ends = [next, nextGroup].filter((i) => i !== -1);
  return markdown.slice(start, ends.length ? Math.min(...ends) : undefined);
}

describe("docs-site CLI reference", () => {
  it("has a section for every command, naming each of its flags", async () => {
    const commands = await page("commands.mdx");
    for (const c of COMMANDS.filter((c) => !c.hidden)) {
      const text = section(commands, c.name);
      expect(text, `klef ${c.name}`).not.toBe("");
      for (const f of c.flags) expect(text, `klef ${c.name} --${f.name}`).toContain(`--${f.name}`);
      for (const alias of c.aliases ?? []) expect(text).toContain(`klef ${alias}`);
    }
  });

  it("lists every global flag", async () => {
    const overview = await page("index.mdx");
    for (const f of GLOBAL_FLAGS) expect(overview).toContain(`--${f.name}`);
  });

  it("documents the same error codes and exit codes as `klef help`", async () => {
    const json = await page("json.mdx");
    const helpCodes = [...topicHelp("json", "klef").matchAll(/^ {2}([a-z_]+) {2,}/gm)].map((m) => m[1]);
    const docCodes = [...json.matchAll(/^\| `([a-z_]+)` \|/gm)].map((m) => m[1]);
    expect(docCodes.sort()).toEqual(helpCodes.sort());

    const helpExits = [...topicHelp("exit-codes", "klef").matchAll(/^ {2}(\d+) /gm)].map((m) => m[1]);
    const docExits = [...json.matchAll(/^\| (\d+) \| /gm)].map((m) => m[1]);
    expect(docExits).toEqual(helpExits);
  });
});
