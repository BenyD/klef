// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The instruction files `klef setup` writes for coding agents, and how they
// are merged into what is already on disk. Pure: the command does the
// filesystem half, so everything here is tested without touching one.
//
// The point is that a new Claude Code or Cursor session already knows how
// this repo's env files work, instead of being taught again every time. What
// it is taught matters as much as that it is taught: the rule that a secret
// value never enters the conversation goes in every file.

/** Where an instruction file goes, and whether it is ours alone. */
export type SetupTarget = "claude" | "claude-md" | "cursor" | "agents";

export const SETUP_TARGETS: readonly SetupTarget[] = ["claude", "claude-md", "cursor", "agents"];

/** What `klef setup` writes with no target named: what the two main agents read. */
export const DEFAULT_TARGETS: readonly SetupTarget[] = ["claude", "cursor"];

/** Targets that make sense in the home directory, for `--global`. */
export const GLOBAL_TARGETS: readonly SetupTarget[] = ["claude", "claude-md"];

export const BLOCK_START = "<!-- klef:start (managed by klef setup; edits inside are replaced) -->";
export const BLOCK_END = "<!-- klef:end -->";

/**
 * Relative to the project root, or to the home directory for a global
 * install. `owned` files are written whole; the others are shared with the
 * user's own instructions and only the marked block is ours.
 */
export function targetPath(target: SetupTarget, global: boolean): { path: string; owned: boolean } {
  switch (target) {
    case "claude":
      return { path: ".claude/skills/klef/SKILL.md", owned: true };
    case "claude-md":
      return { path: global ? ".claude/CLAUDE.md" : "CLAUDE.md", owned: false };
    case "cursor":
      return { path: ".cursor/rules/klef.mdc", owned: true };
    case "agents":
      return { path: "AGENTS.md", owned: false };
  }
}

export function isSetupTarget(value: string): value is SetupTarget {
  return (SETUP_TARGETS as readonly string[]).includes(value);
}

/** One line for the description fields that decide when an agent loads this. */
const SUMMARY =
  "Sync this project's .env files with the Klef vault using the klef CLI " +
  "(status, sync, pull, push, login) without ever reading or printing a secret value.";

/**
 * The shared body. `cli` is how the user reaches the CLI ("klef" or
 * "npx @klefsh/cli"), so the agent is never told to run a binary that is not
 * on PATH.
 */
export function instructionsBody(cli: string): string {
  return `## Klef: env files for this project

This project's environment files (for example \`.env.local\` and
\`.env.production\`) are synced through Klef (https://klef.sh), an end-to-end
encrypted vault. Use the \`${cli}\` CLI for them. It never prints a secret
value, which is what makes it safe for you to run.

### Never read a secret value

- Never open, cat, print, grep, summarise, or commit an env file yourself,
  and never echo a variable's value. Refer to variables by name only.
- If you need to know which keys a file defines, ask the user, or read
  \`.env.example\` if there is one.
- Never ask the user for their master passphrase or access token, and never
  pipe or pass one to the CLI. It reads the passphrase from the terminal on
  purpose, so it cannot pass through you.

### Which files are synced

\`.klef.json\` (safe to read and commit: names only) links this directory to a
project in the vault. \`file\` is the default env file, and the optional
\`files\` list is everything \`--all\` covers, each with the local \`path\` it
lives at. If it sets \`minVersion\` and a command says the CLI is older than
that, run it as \`npx @klefsh/cli@latest <command>\` instead.

### Start with status

Run \`${cli} status --json\` first. In one call, without the passphrase, it
says who is signed in, what this directory is linked to, whether the vault is
unlocked, each file's state (\`in-sync\`, \`edited-here\`, \`changed-in-vault\`,
\`missing-here\`, ...), and \`next\`: the commands that would move things on.

### Commands

    ${cli} status --json         # the one call to start with
    ${cli} sync --dry-run --json # what a sync would do, writing nothing
    ${cli} sync --yes            # pull or push each file, whichever side changed
    ${cli} diff --all --json     # which keys differ (names, never values)
    ${cli} pull --all            # write every file in .klef.json to disk
    ${cli} push --all --yes      # save local changes as new versions
    ${cli} list --json           # files in the vault, names only

With \`--json\` every command prints one object: \`{ "ok": true, "data": ... }\`,
or \`{ "ok": false, "error": { "code", "message", "next": [...] } }\`. Act on
\`error.code\`, not on the wording, and run \`next\` commands as they are. The
exit code says the same (\`${cli} help exit-codes\`). klef never prompts an
agent: where it would need a person, it stops with one of these codes.

- **\`locked\` or \`no_terminal\` (exit 4)**: this device is not unlocked
  yet. Run \`${cli} login\` and tell the user to approve it in the browser
  with "Also unlock the CLI on this device" ticked (one passkey touch, or
  their passphrase, typed in the browser and never in the chat). The CLI
  then keeps the key on this device and pull, push and sync stop asking.
  If the user prefers, they can run \`${cli} unlock\` in their own terminal
  instead. Either way, wait for them; never retry in a loop.
- **\`confirmation_required\` (exit 2)**: the command writes something and
  needs a yes. Say what will change (the plan is in the output), get a yes in
  the chat, then run the \`next\` command, which adds \`--yes\`.
- **\`conflict\` (exit 5)**: both sides changed and nothing was written. Show
  the user which keys differ (in \`data\`) and let them choose; \`next\` holds
  the pull and push that settle it.
- **\`not_signed_in\` or \`not_linked\` (exit 3 or 6)**: run \`${cli} setup\`.
  Sign-in opens the browser for the user to approve; when it needs a choice
  from the user, it stops with the exact command to rerun once they answer.
- **Before pushing**, say which files will change and get a yes in the chat,
  then use \`--yes\`. Push reports only how many lines changed, and every
  earlier version is kept, so a bad push can be restored in the web app.
- **Before pulling** over a file the user may have edited, ask first: pull
  overwrites the local copy and that cannot be undone. \`sync\` is the safe
  choice: it never pulls over a local edit.
- After a pull, check git does not track what it wrote:
  \`git ls-files --error-unmatch <path>\` should fail for every env file. If
  one is tracked, tell the user straight away.
- \`${cli} help <command>\` shows a command's flags and its \`--json\` shape.
  Newer versions may add commands; the same rules apply to every one.

### Deploy platforms (Vercel, GitHub, Cloudflare)

Syncing the local env files with Klef (status, pull, push) is routine; do it
whenever the work calls for it. The platforms are different: Klef only
audits them, read-only, comparing the variable names set on each platform
with the local file, with \`${cli} audit --json\`:

- Run it when it is relevant: setting up a project, a deploy failing on a
  missing variable, or the user asking.
- Report the names that exist only on a platform or only locally, and ask the
  user whether each one is still needed ("Vercel has STRIPE_KEY but
  .env.local does not; is it still used?").
- Never copy a value between places, and never change a platform's variables
  yourself. Names only, in both directions.

To refresh these instructions, run \`${cli} setup\` again.`;
}

/** The text that goes between the markers for one target. */
function block(cli: string): string {
  return `${BLOCK_START}\n${instructionsBody(cli)}\n${BLOCK_END}`;
}

/**
 * The full contents of a file we own. Frontmatter has to come first, before
 * the markers, so it is regenerated along with the block.
 */
function ownedFile(target: SetupTarget, cli: string): string {
  if (target === "claude") {
    return `---\nname: klef\ndescription: ${SUMMARY}\n---\n\n${block(cli)}\n`;
  }
  // Cursor project rule. alwaysApply keeps it in context without the agent
  // having to guess that an env question is a Klef question.
  return `---\ndescription: ${SUMMARY}\nglobs:\nalwaysApply: true\n---\n\n${block(cli)}\n`;
}

/** The marked block in `text`, as [start, end) offsets, or null if absent. */
function findBlock(text: string): [number, number] | null {
  const start = text.indexOf(BLOCK_START);
  if (start === -1) return null;
  const endMarker = text.indexOf(BLOCK_END, start);
  if (endMarker === -1) return null;
  return [start, endMarker + BLOCK_END.length];
}

/**
 * Put our block into a file shared with the user's own instructions: replace
 * it where it already is, or append it after what is there. Everything
 * outside the markers is left byte for byte.
 */
export function upsertBlock(existing: string | null, cli: string): string {
  const fresh = block(cli);
  if (existing === null || existing.trim() === "") return `${fresh}\n`;

  const found = findBlock(existing);
  if (found) return existing.slice(0, found[0]) + fresh + existing.slice(found[1]);

  const separator = existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
  return `${existing}${separator}${fresh}\n`;
}

export type SetupAction = "create" | "update" | "unchanged" | "conflict";

export interface PlannedWrite {
  target: SetupTarget;
  /** Relative to the root it will be written under. */
  path: string;
  action: SetupAction;
  /** What to write; null when nothing will be. */
  contents: string | null;
}

/**
 * Decide what each target needs, given what is on disk now. A file we would
 * own that exists without our marker is someone else's, so it is reported as
 * a conflict and left alone rather than overwritten.
 */
export function planSetup(
  targets: readonly SetupTarget[],
  existing: (path: string) => string | null,
  cli: string,
  global: boolean,
): PlannedWrite[] {
  return targets.map((target) => {
    const { path, owned } = targetPath(target, global);
    const current = existing(path);

    let next: string;
    if (owned) {
      if (current !== null && findBlock(current) === null) {
        return { target, path, action: "conflict", contents: null };
      }
      next = ownedFile(target, cli);
    } else {
      next = upsertBlock(current, cli);
    }

    if (current === next) return { target, path, action: "unchanged", contents: null };
    return { target, path, action: current === null ? "create" : "update", contents: next };
  });
}
