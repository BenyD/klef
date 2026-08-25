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
them.`,
  },
  {
    id: "pull",
    label: "Pull my envs",
    description:
      "Gets this project's env files out of Klef and onto this machine. The agent runs the CLI; you type the passphrase and it never prints a value.",
    body: `Get this project's environment files out of Klef (https://klef.sh) and onto
this machine, using the Klef CLI.

Two things stay mine throughout: the access token and the master passphrase.
Don't ask me for either. The CLI reads the passphrase straight from the
terminal, which is exactly why it can't pass through you.

1. Check where things stand: \`npx @klefsh/cli status\`.
   If it says I'm not signed in, give me \`npx @klefsh/cli login\` to run myself and
   wait. I'll paste a token from klef.sh → Settings → Security → Developer.
2. If this directory isn't linked yet, run \`npx @klefsh/cli link\` to list what's in
   my vault, show me the options, and link the one I pick with
   \`npx @klefsh/cli link <workspace> <project> <file>\`. That writes .klef.json,
   which is safe to commit, since it holds names, never values.
3. Give me \`npx @klefsh/cli pull\` to run myself. It stops for my passphrase, so it
   won't work if you run it. Hand it over and wait for me to confirm.
4. For other files in the same project, the same applies with
   \`npx @klefsh/cli pull --file <name>\` (for example .env.local, then
   .env.production).
5. Finally, check every file it wrote is ignored by git:
   \`git ls-files --error-unmatch <path>\` should fail for each. If one is tracked,
   tell me immediately.

\`pull\` writes files at mode 0600 and reports only a count, never a value. Don't
open or print what it wrote; if you need to know which keys a file defines, ask
me.`,
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
 * Quote a workspace, project or file name for a shell command.
 *
 * Names are free text, so one containing a quote or a space would otherwise
 * produce a command that silently targets the wrong thing - or nothing. Single
 * quotes with the standard '\'' escape, because inside them a shell expands
 * nothing at all.
 */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * The prompt offered from a file in the vault.
 *
 * Unlike the landing-page version this one already knows what the reader is
 * looking at, so the agent runs one command instead of listing the vault and
 * waiting for a choice. `pull` is still handed back, since it stops for the
 * passphrase and an agent running it only reaches the no-terminal error.
 */
export function filePullPrompt(target: {
  workspace: string;
  project: string;
  file: string;
}): string {
  const link = [
    "npx @klefsh/cli link",
    shellQuote(target.workspace),
    shellQuote(target.project),
    shellQuote(target.file),
  ].join(" ");

  return `Get ${target.file} out of Klef (https://klef.sh) and into this repo.

1. Link this directory to it:
   ${link}
2. Then give me \`npx @klefsh/cli pull\` to run myself, and wait. It stops for my
   master passphrase, which is read from the terminal, so it won't work if you
   run it and I won't paste it to you.
3. Once it reports a count, check the file is ignored by git:
   \`git ls-files --error-unmatch ${target.file}\` should fail. If it doesn't,
   tell me immediately.

If I'm not signed in, step 1 will say so; give me \`npx @klefsh/cli login\` to run
and wait for me. \`pull\` writes at mode 0600 and reports only how many
variables it wrote. Don't open or print what it wrote; if you need to know
which keys it defines, ask me.

${SECRET_SAFETY_RULE}`;
}
