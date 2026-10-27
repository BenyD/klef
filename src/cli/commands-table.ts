// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Every command and flag klef has, in one table. Help, flag validation,
// "did you mean" and shell completion are all generated from it, so the four
// cannot drift apart. Pure: strings in, strings out.

export interface FlagSpec {
  name: string;
  short?: string;
  /** Placeholder when the flag takes a value, e.g. "name". */
  value?: string;
  description: string;
}

export interface CommandSpec {
  name: string;
  aliases?: string[];
  group: Group;
  /** Arguments after the name, as shown in usage: "[workspace] [project]". */
  args?: string;
  summary: string;
  /** A paragraph for `klef help <command>`; the summary when absent. */
  description?: string;
  flags: FlagSpec[];
  examples: [command: string, comment: string][];
  /** The shape of `data` under --json, for `klef help <command>`. */
  json: string;
  /** Kept working, not listed: an old name or an internal entry point. */
  hidden?: boolean;
}

export const GROUPS = ["Get started", "Everyday", "Unlock", "Look around", "New machine", "Account", "More"] as const;
export type Group = (typeof GROUPS)[number];

/** Flags every command takes. */
export const GLOBAL_FLAGS: FlagSpec[] = [
  { name: "json", description: "Print one JSON object on stdout (see `klef help json`)" },
  { name: "quiet", short: "q", description: "Print only what changed, nothing else" },
  { name: "yes", short: "y", description: "Answer yes to confirmations; needed when there is no terminal" },
  { name: "no-input", description: "Never prompt; fail with the command to run instead" },
  { name: "no-color", description: "No colour, even on a terminal" },
  { name: "cwd", short: "C", value: "dir", description: "Run as if started in <dir>" },
  { name: "help", short: "h", description: "Show help for klef or a command" },
  { name: "version", description: "Print the version" },
];

const FILE: FlagSpec = { name: "file", value: "name", description: "One env file in the vault, by name" };
const PATH: FlagSpec = { name: "path", value: "path", description: "Where it lives here (default: its name)" };
const ALL: FlagSpec = { name: "all", description: "Every file listed in .klef.json" };
const EXIT_CODE: FlagSpec = { name: "exit-code", description: "Exit 10 when there are differences" };

export const COMMANDS: CommandSpec[] = [
  {
    name: "setup",
    group: "Get started",
    args: "[claude|cursor|claude-md|agents|all]",
    summary: "Sign in, link this repo, teach your agents, and pull, in one go",
    description:
      "Runs every step a repo needs and skips the ones already done, so it is safe to rerun. " +
      "Naming targets only writes the agent instructions: a Claude Code skill (claude), a Cursor " +
      "rule (cursor), a block in CLAUDE.md (claude-md) or AGENTS.md (agents). Without a terminal " +
      "it stops at each choice and prints the command to rerun once the user has answered.",
    flags: [
      { name: "workspace", value: "name", description: "Link to a project in this workspace" },
      { name: "project", value: "name", description: "Link to this project, without the menu" },
      { name: "global", description: "Install the Claude Code skill for every project" },
      { name: "paste", description: "Sign in by pasting a token instead of the browser" },
    ],
    examples: [
      ["klef setup", "Everything, step by step"],
      ["klef setup --project lensdrop --yes", "No menu and no questions, for an agent"],
      ["klef setup claude cursor", "Only (re)write the agent instructions"],
    ],
    json: "{ signedIn, email, linked: { workspace, project, files }, agentFiles: [ { path, action } ], pulled: [ path ] }",
  },
  {
    name: "login",
    group: "Get started",
    summary: "Sign in through the browser, and unlock this device",
    description:
      "Shows a code, opens klef.sh to approve it, and waits. Approving there can also unlock " +
      "this CLI: the page asks for your passkey or passphrase and sends the vault key sealed to " +
      "this terminal, which keeps it in the OS keychain so pull, push and sync never ask. The " +
      "token is stored the same way; on its own it reaches ciphertext and names only.",
    flags: [
      { name: "paste", description: "Paste a token from Settings instead, for machines with no browser" },
      { name: "no-remember", description: "Never keep the vault key on this device (persists)" },
      { name: "remember", description: "Keep the vault key on this device again (the default)" },
    ],
    examples: [
      ["klef login", "Approve in the browser, and unlock this device"],
      ["klef login --no-remember", "Sign in, and keep no key here"],
    ],
    json: "{ email, tokenStore: \"keychain\" | \"file\", unlocked }",
  },
  {
    name: "link",
    group: "Get started",
    args: "[workspace] [project] [file]",
    summary: "Link this directory to a project in the vault (.klef.json)",
    description:
      "Writes .klef.json, which holds names only and is safe to commit. Records .env.local and " +
      ".env.production when the project has them, so sync, pull --all and push --all cover both. " +
      "With no arguments, lists what can be linked.",
    flags: [
      { name: "workspace", value: "name", description: "The workspace, instead of the first argument" },
      { name: "project", value: "name", description: "The project, instead of the second argument" },
      FILE,
    ],
    examples: [
      ["klef link", "See what can be linked"],
      ["klef link Personal lensdrop", "Link to a project"],
    ],
    json: "{ workspace, project, file, files: [ { file, path } ], config, changed }",
  },
  {
    name: "status",
    group: "Everyday",
    summary: "Sign-in, link, lock state and each file's sync state, in one call",
    description:
      "Reads only: no passphrase needed. Each linked file is reported as in sync, edited here, " +
      "changed in the vault, missing, or unknown, from what this machine last synced. " +
      "`klef status --json` is the one call an agent needs before anything else.",
    flags: [],
    examples: [
      ["klef status", "What is going on here"],
      ["klef status --json", "The same, for a script or an agent"],
    ],
    json:
      "{ version, server, account: { signedIn, email, tokenSource, tokenStatus }, " +
      "vault: { unlocked, unlockedBy: \"remembered\" | \"agent\" | null, keyStore, locksInSeconds }, project: { workspace, project, config } | null, " +
      "files: [ { file, path, local, inVault, state } ], next: [ command ] }",
  },
  {
    name: "sync",
    group: "Everyday",
    summary: "Pull or push each linked file, whichever side changed",
    description:
      "A file edited here since it last matched the vault is pushed; one changed in the vault is " +
      "pulled over the untouched local copy. If both changed, or this machine never synced a file " +
      "that differs, nothing is written and the differing keys are listed (names, never values). " +
      "Pushes ask first.",
    flags: [{ name: "dry-run", short: "n", description: "Show what would happen, and do none of it" }],
    examples: [
      ["klef sync", "Bring everything in line"],
      ["klef sync --dry-run --json", "What would change, for an agent"],
    ],
    json:
      "{ dryRun, files: [ { file, path, action, reason, keys?: { onlyLocal, onlyVault, changed } } ] }  " +
      "action: in-sync | pull | push | create | conflict | absent",
  },
  {
    name: "pull",
    group: "Everyday",
    summary: "Write the vault's copy of env files here",
    description:
      "Writes each file at mode 0600 and reports how many variables it holds; never a value. " +
      "Overwrites the local copy: `klef sync` is the safe choice when this one may have been edited.",
    flags: [FILE, PATH, ALL],
    examples: [
      ["klef pull --all", "Every file listed in .klef.json"],
      ["klef pull --file .env.production", "One file"],
    ],
    json: "{ files: [ { file, path, variables, version } ] }",
  },
  {
    name: "push",
    group: "Everyday",
    summary: "Save local env files to the vault as new versions",
    description:
      "Shows what will change in line counts and asks once. Every earlier version is kept, so a " +
      "push can be undone in the web app.",
    flags: [FILE, PATH, ALL],
    examples: [
      ["klef push", "The linked file"],
      ["klef push --all --yes", "Every listed file, no question (after asking the user)"],
    ],
    json: "{ files: [ { file, path, action, variables, added, removed, version } ] }  action: pushed | unchanged",
  },
  {
    name: "diff",
    group: "Everyday",
    summary: "Compare local files with the vault, by key, writing nothing",
    flags: [FILE, PATH, ALL, EXIT_CODE],
    examples: [
      ["klef diff --all", "Which keys differ, and how"],
      ["klef diff --all --exit-code", "Exit 10 if anything differs, for scripts"],
    ],
    json: "{ files: [ { file, path, state, reason, onlyLocal, onlyVault, changed } ] }",
  },
  {
    name: "unlock",
    group: "Unlock",
    summary: "Unlock this device with the passphrase, once",
    description:
      "For when the browser did not unlock this CLI at login. Reads the passphrase from the " +
      "terminal only, never a flag, pipe or variable, so whatever ran klef cannot supply or see " +
      "it, and keeps the vault key in the OS keychain so later commands never ask. With --for, " +
      "or with remembering off, a background agent holds the key in memory instead and forgets " +
      "it after that long without use.",
    flags: [{ name: "for", value: "time", description: "Unlock for a while instead: 30m, 8h, 7d, held in memory" }],
    examples: [
      ["klef unlock", "Unlock this device"],
      ["klef unlock --for 8h", "Only for a working day"],
    ],
    json: "{ unlocked: true, alreadyUnlocked, remembered, locksInSeconds }",
  },
  {
    name: "lock",
    group: "Unlock",
    summary: "Forget the key on this device",
    description:
      "Forgets the vault key kept in the keychain and stops the unlock agent. Every command then " +
      "asks for the passphrase until the next unlock or browser sign-in.",
    flags: [],
    examples: [["klef lock", "Lock this device"]],
    json: "{ locked: true, wasUnlocked }",
  },
  {
    name: "list",
    aliases: ["ls"],
    group: "Look around",
    summary: "List the env files in your vault, names only",
    flags: [],
    examples: [["klef list --json", "For a script or an agent"]],
    json: "{ files: [ { workspace, project, file, environment, hasVersion } ] }",
  },
  {
    name: "audit",
    group: "Look around",
    args: "[vercel|github|cloudflare]",
    summary: "Key names on Vercel, GitHub or Cloudflare vs your local files",
    description:
      "Read-only, names only, through your own vercel, gh and wrangler sign-ins. klef never " +
      "writes to those platforms. A platform not set up here, or whose CLI is missing or signed " +
      "out, is reported and the rest still run.",
    flags: [EXIT_CODE],
    examples: [
      ["klef audit", "Every platform set up in this directory"],
      ["klef audit vercel --json", "One platform, for an agent"],
    ],
    json:
      "{ targets: [ { platform, environment, label, file, status, reason, onlyOnPlatform, onlyLocal, both } ] }  " +
      "status: ok | no-local-file | skipped | unavailable",
  },
  {
    name: "restore",
    group: "New machine",
    args: "[dir]",
    summary: "Pull every linked checkout under a directory",
    description:
      "For a new or reset machine: clone your repos, then run this once. It lists the checkouts " +
      "it found and asks before decrypting anything, then only pulls. Anything that would push, " +
      "and any conflict, is left for `klef sync` in that checkout.",
    flags: [],
    examples: [["klef restore ~/Developer", "Every linked repo under ~/Developer"]],
    json: "{ root, projects: [ { dir, workspace, project, files: [ { path, action, reason } ] } ], problems: [ { dir, error } ] }",
  },
  {
    name: "logout",
    group: "Account",
    summary: "Forget the stored token on this machine",
    flags: [],
    examples: [["klef logout", "The token stays valid until you revoke it in the web app"]],
    json: "{ signedOut, tokenStillInEnvironment }",
  },
  {
    name: "completion",
    group: "More",
    args: "<bash|zsh|fish>",
    summary: "Print a shell completion script",
    flags: [],
    examples: [
      ["klef completion zsh > \"${fpath[1]}/_klef\"", "zsh"],
      ["klef completion bash >> ~/.bashrc", "bash"],
      ["klef completion fish > ~/.config/fish/completions/klef.fish", "fish"],
    ],
    json: "(prints the script; --json is not supported)",
  },
  {
    name: "help",
    group: "More",
    args: "[command|topic]",
    summary: "Show help for klef, a command, or a topic",
    flags: [],
    examples: [
      ["klef help pull", "One command"],
      ["klef help json", "The --json format"],
    ],
    json: "(prints help; --json is not supported)",
  },
];

/** `klef help <topic>`, beside the commands. */
export const TOPICS = ["json", "exit-codes", "environment"] as const;

/** The command a name or alias means, hidden ones included. */
export function findCommand(name: string): CommandSpec | undefined {
  return COMMANDS.find((c) => c.name === name || c.aliases?.includes(name));
}

/** Levenshtein distance, for "did you mean". */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = row[j]!;
      row[j] = next;
    }
  }
  return row[b.length]!;
}

/** The closest of `options` to `typed`, if it is close enough to be a typo. */
export function suggest(typed: string, options: readonly string[]): string | null {
  let best: string | null = null;
  let bestScore = Infinity;
  for (const option of options) {
    const score = option.startsWith(typed) && typed.length >= 2 ? 0.5 : distance(typed, option);
    if (score < bestScore) {
      best = option;
      bestScore = score;
    }
  }
  return best !== null && bestScore <= Math.max(1, Math.ceil(typed.length / 3)) ? best : null;
}

/** Every flag a command accepts, its own and the global ones. */
export function flagsOf(spec: CommandSpec | null): FlagSpec[] {
  return [...(spec?.flags ?? []), ...GLOBAL_FLAGS];
}

/**
 * A flag this command does not take, with a suggestion, or null when every
 * flag is known. `v` stays accepted for --version, as before.
 */
export function unknownFlag(spec: CommandSpec | null, given: Iterable<string>): { flag: string; suggestion: string | null } | null {
  const known = flagsOf(spec);
  const names = new Set(known.flatMap((f) => [f.name, ...(f.short ? [f.short] : [])]));
  names.add("v");
  for (const flag of given) {
    if (names.has(flag)) continue;
    return { flag, suggestion: suggest(flag, known.map((f) => f.name)) };
  }
  return null;
}

function flagLabel(f: FlagSpec): string {
  const long = `--${f.name}${f.value ? ` <${f.value}>` : ""}`;
  return f.short ? `-${f.short}, ${long}` : `    ${long}`;
}

function table(rows: [string, string][], indent = "  ", minWidth = 0): string[] {
  const width = Math.max(minWidth, ...rows.map(([left]) => left.length));
  return rows.map(([left, right]) => `${indent}${left.padEnd(width)}   ${right}`.trimEnd());
}

/** Example lines with `klef` swapped for how the user invoked us. */
function examples(spec: CommandSpec, cli: string): string[] {
  return spec.examples.flatMap(([c, comment]) => [`  # ${comment}`, `  $ ${c.replace(/^klef\b/, cli)}`]);
}

export function rootHelp(cli: string, version: string): string {
  const lines = [`klef ${version}: end-to-end encrypted .env sync`, "", "Usage", `  ${cli} <command> [flags]`];
  const label = (c: CommandSpec) => [c.name, ...(c.aliases ?? [])].join(", ");
  const width = Math.max(...COMMANDS.filter((c) => !c.hidden).map((c) => label(c).length));
  for (const group of GROUPS) {
    const members = COMMANDS.filter((c) => c.group === group && !c.hidden);
    if (!members.length) continue;
    lines.push("", group);
    lines.push(...table(members.map((c) => [label(c), c.summary]), "  ", width));
  }
  lines.push("", "Global flags", ...table(GLOBAL_FLAGS.map((f) => [flagLabel(f), f.description])));
  lines.push(
    "",
    "Learn more",
    ...table([
      [`${cli} help <command>`, "Flags, examples and --json shape for one command"],
      [`${cli} help json`, "The --json format and error codes"],
      [`${cli} help exit-codes`, "What each exit code means"],
      [`${cli} help environment`, "Environment variables and precedence"],
    ]),
    "",
    "klef never prints a secret value, and reads the passphrase only from the terminal.",
    "No telemetry, no update checks.",
  );
  return lines.join("\n");
}

export function commandHelp(spec: CommandSpec, cli: string): string {
  const usageFlags = spec.flags.length ? " [flags]" : "";
  const lines = [
    spec.description ?? spec.summary,
    "",
    "Usage",
    `  ${cli} ${spec.name}${spec.args ? ` ${spec.args}` : ""}${usageFlags}`,
  ];
  if (spec.aliases?.length) lines.push("", "Aliases", `  ${spec.aliases.join(", ")}`);
  if (spec.flags.length) lines.push("", "Flags", ...table(spec.flags.map((f) => [flagLabel(f), f.description])));
  lines.push("", "Global flags", "  --json, -q/--quiet, -y/--yes, --no-input, --no-color, -C/--cwd <dir>");
  lines.push("", "Examples", ...examples(spec, cli));
  lines.push("", "JSON (data)", `  ${spec.json}`);
  return wrapParagraph(lines).join("\n");
}

/** Wrap the first line (the description) at 80 columns; the rest is laid out already. */
function wrapParagraph(lines: string[]): string[] {
  const [first, ...rest] = lines;
  const words = (first ?? "").split(" ");
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > 80) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return [...out, ...rest];
}

export function topicHelp(topic: (typeof TOPICS)[number], cli: string): string {
  if (topic === "exit-codes") {
    return [
      "Exit codes (stable across minor versions)",
      "",
      ...table([
        ["0", "Success, including nothing to do"],
        ["1", "Failure: network, server, or something unexpected"],
        ["2", "Usage error, or a confirmation was needed and no one could answer (rerun with --yes)"],
        ["3", "Not signed in, or the token was rejected (klef login)"],
        ["4", "Locked: this device needs unlocking (klef login in the browser, or klef unlock)"],
        ["5", "Conflict: both sides changed; nothing was written"],
        ["6", "Not found: not linked here, or no such workspace, project or file"],
        ["10", "Differences found, only with --exit-code (diff, audit)"],
        ["130", "Interrupted (Ctrl-C)"],
      ]),
      "",
      `With --json the same code is in the output as "exit" on failure.`,
    ].join("\n");
  }
  if (topic === "environment") {
    return [
      "Environment",
      "",
      ...table([
        ["KLEF_API_URL", "Server to use (default https://klef.sh), for self-hosting"],
        ["KLEF_TOKEN", "Access token to use instead of the stored one"],
        ["KLEF_NO_KEYCHAIN", "Store the token in a 0600 file instead of the OS keychain"],
        ["KLEF_CONFIG_DIR", "Where klef keeps state (default ~/.config/klef)"],
        ["KLEF_AGENT_SOCK", "Where the unlock agent's socket lives"],
        ["KLEF_NO_REMEMBER", "Never keep the vault key on this device, for this run"],
        ["KLEF_NO_INPUT", "Never prompt, like --no-input"],
        ["CI", "Set by CI systems; klef then never prompts"],
        ["NO_COLOR", "No colour (https://no-color.org)"],
        ["FORCE_COLOR", "Colour even when not on a terminal (0 turns it off)"],
      ]),
      "",
      "Precedence: flags, then environment, then .klef.json, then defaults.",
      "There is no variable or flag for the passphrase, by design.",
    ].join("\n");
  }
  return [
    "JSON output",
    "",
    `Every command takes --json and then prints exactly one object on stdout. Anything`,
    `for a person (hints, progress) goes to stderr, which an agent can ignore.`,
    "",
    "Success",
    `  { "schema": 1, "ok": true, "command": "pull", "data": { ... }, "warnings": [] }`,
    "",
    "Failure",
    `  { "schema": 1, "ok": false, "command": "pull",`,
    `    "error": { "code": "locked", "message": "...", "hint": "...",`,
    `               "next": [ { "command": "${cli} unlock" } ] },`,
    `    "exit": 4, "warnings": [] }`,
    "",
    `"schema" changes only for a breaking change; new fields are not one. "next" holds`,
    `commands to run as they are; none of them ever carries a value.`,
    `Each command's "data" is in \`${cli} help <command>\`.`,
    "",
    "Error codes",
    ...table([
      ["usage", "Unknown command or flag, or a bad value (exit 2)"],
      ["confirmation_required", "A yes was needed; ask the user, then rerun with --yes (exit 2)"],
      ["unsafe_path", "A path outside this directory (exit 2)"],
      ["not_signed_in", "No token on this machine (exit 3)"],
      ["token_rejected", "The token expired or was revoked (exit 3)"],
      ["locked", "Locked on this device; the user approves klef login, or runs unlock (exit 4)"],
      ["no_terminal", "A person must do this at a terminal (exit 4)"],
      ["wrong_passphrase", "The passphrase did not unlock the vault (exit 4)"],
      ["conflict", "Both sides changed; nothing was written (exit 5)"],
      ["not_linked", "No .klef.json here (exit 6)"],
      ["not_found", "No such workspace, project or file (exit 6)"],
      ["no_vault", "The account has no vault yet (exit 6)"],
      ["network", "The server could not be reached (exit 1)"],
      ["server", "The server refused or failed (exit 1)"],
      ["unsupported", "Not available on this platform (exit 1)"],
      ["internal", "Anything else (exit 1)"],
    ]),
  ].join("\n");
}

/** A completion script for one shell, from the table. Static: no klef call at completion time. */
export function completionScript(shell: "bash" | "zsh" | "fish"): string {
  const visible = COMMANDS.filter((c) => !c.hidden);
  const names = visible.flatMap((c) => [c.name, ...(c.aliases ?? [])]);
  const flagWords = (c: CommandSpec) => flagsOf(c).map((f) => `--${f.name}`).join(" ");

  if (shell === "bash") {
    const cases = visible
      .map((c) => `    ${[c.name, ...(c.aliases ?? [])].join("|")}) opts="${flagWords(c)}" ;;`)
      .join("\n");
    return [
      "# klef bash completion. Add to ~/.bashrc: eval \"$(klef completion bash)\"",
      "_klef() {",
      '  local cur="${COMP_WORDS[COMP_CWORD]}" sub="${COMP_WORDS[1]}" opts',
      "  if [ \"$COMP_CWORD\" -eq 1 ]; then",
      `    COMPREPLY=($(compgen -W "${names.join(" ")}" -- "$cur")); return`,
      "  fi",
      '  case "$sub" in',
      cases,
      "    *) opts=\"\" ;;",
      "  esac",
      '  COMPREPLY=($(compgen -W "$opts" -- "$cur"))',
      "}",
      "complete -o default -F _klef klef",
      "",
    ].join("\n");
  }

  if (shell === "zsh") {
    const subs = visible.map((c) => `    '${c.name}:${c.summary.replace(/'/g, "")}'`).join("\n");
    const cases = visible
      .map((c) => {
        const specs = flagsOf(c)
          .map((f) => `'--${f.name}[${f.description.replace(/['[\]]/g, "")}]${f.value ? `:${f.value}:` : ""}'`)
          .join(" ");
        return `    ${[c.name, ...(c.aliases ?? [])].join("|")}) _arguments ${specs} '*:file:_files' ;;`;
      })
      .join("\n");
    return [
      "#compdef klef",
      "# klef zsh completion. Save as _klef somewhere on $fpath.",
      "_klef() {",
      "  local -a subcommands",
      "  subcommands=(",
      subs,
      "  )",
      "  if (( CURRENT == 2 )); then",
      "    _describe 'command' subcommands; return",
      "  fi",
      "  case $words[2] in",
      cases,
      "  esac",
      "}",
      '_klef "$@"',
      "",
    ].join("\n");
  }

  const lines = ["# klef fish completion. Save as ~/.config/fish/completions/klef.fish", "complete -c klef -f"];
  for (const c of visible) {
    lines.push(`complete -c klef -n __fish_use_subcommand -a ${c.name} -d '${c.summary.replace(/'/g, "\\'")}'`);
    for (const f of c.flags) {
      lines.push(
        `complete -c klef -n '__fish_seen_subcommand_from ${c.name}' -l ${f.name}${f.value ? " -r" : ""} -d '${f.description.replace(/'/g, "\\'")}'`,
      );
    }
  }
  for (const f of GLOBAL_FLAGS) {
    lines.push(`complete -c klef -l ${f.name}${f.short ? ` -s ${f.short}` : ""}${f.value ? " -r" : ""} -d '${f.description.replace(/'/g, "\\'")}'`);
  }
  return `${lines.join("\n")}\n`;
}
