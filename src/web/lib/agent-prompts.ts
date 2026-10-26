import { shellQuote } from "../../shared/shell.ts";

// Copy-paste prompts for coding agents, offered on the landing page.
//
// These are product surface, not decoration: someone pastes one into Claude
// Code and it runs against their real repo or their real Cloudflare account.
// They live here rather than inline in the component so the invariants below
// can be tested — in particular that every prompt carries the secret-safety
// rule, and that no prompt references a pnpm script that doesn't exist.

/**
 * Appended to every prompt. Klef's whole posture is that secret *values* never
 * reach a server, a log, or a model context — a prompt we hand out has to say
 * so, because the agent following it is the exact thing that would otherwise
 * echo a decrypted .env into a transcript.
 */
export const SECRET_SAFETY_RULE =
  "Never print, echo, log, or commit a secret value while doing this. " +
  "Refer to environment variables by name only.";

export interface AgentPrompt {
  id: string;
  /** Tab label. */
  label: string;
  /** One line under the tabs, setting expectations before someone copies. */
  description: string;
  body: string;
}

const PROMPTS = [
  {
    id: "project",
    // Not "Get started" — that's the hero's primary CTA, and two controls with
    // the same label doing different things is a coin flip for the reader.
    label: "Set up my repo",
    description:
      "Audits this repo's env files, plans your Klef structure, then walks you through the browser steps. It never opens a file's contents.",
    body: `Help me get this repository's environment files into Klef (https://klef.sh).

You can't do this entirely for me, and that's deliberate. Klef accounts are
Google or passkey sign-in, and the encryption key comes from a passphrase that
never leaves my browser, so signing in and pasting the files are mine to do.
Your job is to prepare everything, then walk me through it step by step.

1. List every environment file in this repo by path: .env, .env.local,
   .env.production, and any framework-specific variants. List the paths only.
   Do not open or read the contents of any of them. If you need to know which
   keys a file defines, ask me and I'll tell you.
2. For each one, check whether git actually tracks it, with
   \`git ls-files --error-unmatch <path>\`, rather than only whether .gitignore
   mentions it. A file committed before the ignore rule was added is still
   tracked and still leaking. If any is tracked, tell me which and stop there.
3. Propose the structure: which Klef project each file belongs to, and whether
   its environment label is development, preview, or production.
4. Then give me a numbered checklist to do in the browser, and wait for me to
   confirm each step before moving on:
   - open https://klef.sh and sign in
   - set a master passphrase, and save the recovery key somewhere safe
     (if I lose both, the data is gone, and Klef cannot reset it)
   - create the project(s) you proposed
   - for each file, tell me which one to paste next and what to name it

I'll paste the file contents in myself. Klef encrypts them in my browser, so the
server only ever stores ciphertext, which is also why you never need to see
them.

5. Once they are in, give me \`npx @klefsh/cli setup\` to run in my own
   terminal. That one command signs this machine in, links the repo, installs
   Klef instructions for Claude Code and Cursor (so later sessions already know
   how to sync these files), and pulls them back down.`,
  },
  {
    id: "connect",
    label: "Connect my agent",
    description:
      "One time per repo: signs this machine in, links the repo, and installs instructions so every later Claude Code or Cursor session already knows Klef.",
    body: `Connect this repository to Klef (https://klef.sh) with one command, so that
you and every later agent session in this repo know how to sync its env files.

Run \`npx @klefsh/cli setup\` and follow what it prints. It skips any step that
is already done, so it is safe to run again. Along the way:

1. Sign-in opens my browser. Tell me to approve it there and wait.
2. If my vault has more than one project, it lists them by name and asks which
   one this repo is. Ask me, then rerun with the
   \`--workspace <workspace> --project <project>\` it suggests. That writes
   .klef.json, which holds names only and is safe to commit.
3. It wants to write a Claude Code skill (.claude/skills/klef/SKILL.md) and a
   Cursor rule (.cursor/rules/klef.mdc). Show me those paths and ask me first.
   Only once I say yes, rerun with \`--yes\`. They hold commands and rules,
   never a value.
4. Pulling needs my master passphrase, which the CLI reads from the terminal so
   it never passes through you. When it says so, give me
   \`npx @klefsh/cli unlock\` to run myself and wait for me. Then run setup
   again: it pulls only the files that are not on disk yet, so nothing I have
   edited locally is overwritten, and it reports a count, never a value.
5. Check git does not track any env file it wrote:
   \`git ls-files --error-unmatch <path>\` should fail for each. If one is
   tracked, tell me immediately.

From then on, the installed instructions cover status, pull, push, and unlock,
so no later session needs this prompt. Don't ask me for my passphrase or access
token, and don't open or print any env file.`,
  },
  {
    id: "self-host",
    label: "Self-host Klef",
    description:
      "Deploys your own Klef on your Cloudflare account, so the server storing your ciphertext is one you control.",
    body: `Set up a self-hosted Klef instance on my Cloudflare account, end to end.

1. Fork https://github.com/BenyD/klef (use the gh CLI, or ask me to do it in the
   browser), clone the fork, and run \`pnpm install\`.
2. Authenticate Wrangler with \`pnpm exec wrangler login\`.
3. Create the database with \`pnpm exec wrangler d1 create klef-db\`, then put the
   returned database_id into wrangler.jsonc.
4. Apply the schema with \`pnpm db:migrate:remote\`.
5. Create a Google OAuth client at https://console.cloud.google.com/apis/credentials
   with an authorized redirect URI of https://<my-domain>/api/auth/callback/google.
   Ask me for the domain if you don't know it.
6. Stop here and give me these commands to run myself, then wait for me to
   confirm. Do not run them for me, and do not ask me for the values:
   \`wrangler secret put\` reads from the terminal, so the only way you could set
   them is by holding the plaintext, and these must not pass through you.
     pnpm exec wrangler secret put BETTER_AUTH_SECRET   # openssl rand -base64 32
     pnpm exec wrangler secret put BETTER_AUTH_URL      # my deployed URL
     pnpm exec wrangler secret put GOOGLE_CLIENT_ID
     pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
7. Deploy with \`pnpm deploy\`, then check that /api/health returns ok.

Stop and ask me before anything that costs money or touches DNS.`,
  },
] as const satisfies readonly AgentPrompt[];

/** The full text to copy: body plus the shared safety rule. */
export function promptText(prompt: AgentPrompt): string {
  return `${prompt.body}\n\n${SECRET_SAFETY_RULE}`;
}

/**
 * Packages the prompts may tell a reader to run. Add one only once it is
 * actually on npm: klef.sh once shipped a prompt naming @klefsh/cli before it
 * was published, so every visitor who copied it got a 404 on line one.
 */
export const PUBLISHED_PACKAGES: readonly string[] = ["@klefsh/cli"];

/**
 * The one command that connects a repo: signs in, links, installs the agent
 * instructions and pulls. The command menu copies it; the prompts above spell
 * it out inline, and a test holds the "connect" prompt to this exact string.
 */
export const SETUP_COMMAND = "npx @klefsh/cli setup";

/** Every `npx <package>` a prompt tells the reader to run. */
export function npxPackagesIn(text: string): string[] {
  return [
    ...new Set(
      [...text.matchAll(/\bnpx\s+(?:--yes\s+)?(@?[\w./-]+)/g)].map((m) => m[1]!),
    ),
  ].sort();
}

export const AGENT_PROMPTS: readonly AgentPrompt[] = PROMPTS;

/**
 * The prompt behind the hero's copy button, where there is no room to choose.
 * Onboarding, not self-hosting: someone reading the hero for the first time has
 * a repo full of env files, not a Cloudflare account they want to deploy to.
 */
export const DEFAULT_PROMPT: AgentPrompt = AGENT_PROMPTS[0] as AgentPrompt;

/** pnpm subcommands that aren't package scripts, so they can't be validated. */
const PNPM_BUILTINS = new Set([
  "install",
  "exec",
  "dlx",
  "add",
  "remove",
  "run",
  "why",
  "up",
]);

/**
 * Every `pnpm <name>` in a prompt that should resolve to a package.json script.
 * Used by the tests to catch a prompt drifting out of sync with the repo — a
 * broken command on the landing page is worse than no command at all.
 */
export function pnpmScriptsIn(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\bpnpm\s+([a-z][\w:-]*)/g)) {
    const name = match[1];
    if (name && !PNPM_BUILTINS.has(name)) found.add(name);
  }
  return [...found].sort();
}

/**
 * The prompt offered from a file in the vault.
 *
 * Unlike the landing-page version this one already knows which project the
 * reader is looking at, so `setup` gets it by flag instead of asking. The
 * unlock is still handed back, since it stops for the passphrase and an agent
 * running it only reaches the no-terminal error.
 */
export function filePullPrompt(target: {
  workspace: string;
  project: string;
  file: string;
}): string {
  const setup = [
    "npx @klefsh/cli setup --workspace",
    shellQuote(target.workspace),
    "--project",
    shellQuote(target.project),
  ].join(" ");

  return `Connect this repo to the ${target.project} project in Klef (https://klef.sh),
which holds ${target.file}, so its env files sync here and every later agent
session already knows how.

1. Run:
   ${setup}
   If I'm not signed in, it opens my browser; tell me to approve it and wait.
2. It wants to write a Claude Code skill and a Cursor rule. Show me the paths
   it lists and ask me. Only once I say yes, rerun it with --yes.
3. When it asks for the passphrase, give me \`npx @klefsh/cli unlock\` to run
   myself, and wait. The passphrase is read from the terminal, so it won't
   work if you run it and I won't paste it to you. Then run the setup command
   again; it pulls only the files that are not on disk yet.
4. Check every env file it wrote is ignored by git:
   \`git ls-files --error-unmatch ${target.file}\` should fail. If it doesn't,
   tell me immediately.

Pulled files are written at mode 0600 and reported only as a count.
Don't open or print what it wrote; if you need to know which keys it defines,
ask me.

${SECRET_SAFETY_RULE}`;
}
