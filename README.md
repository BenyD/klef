# Klef CLI and core

**The command line for [Klef](https://klef.sh), personal, end-to-end encrypted
`.env` sync, and the encryption it shares with the web app.** Env files are
encrypted on your device before they leave; the server stores ciphertext it
cannot decrypt. The CLI never prints a secret value, which is what makes it
safe to hand to a coding agent.

This repository holds the code you have to trust:

- [`src/cli`](./src/cli): `@klefsh/cli`, the `klef` command.
- [`src/shared`](./src/shared): `@klefsh/core`, the encryption, the blob
  format and the env-text editing. The klef.sh web app runs this same code in
  your browser. [`src/shared/core.ts`](./src/shared/core.ts) is its entry, and
  `scripts/core-boundary.test.ts` keeps it a closed set that imports nothing
  but `hash-wasm`.

The klef.sh server and web app live in a separate repository. This one is
exported from it automatically, so every commit here matches what the CLI and
the web app actually run.

## The CLI

The CLI holds an access token that
reaches ciphertext and plaintext names only, and derives your key locally from
a passphrase read straight from the terminal. It cannot be run unattended by
design: `klef unlock` lets one passphrase cover a run of commands, held in
memory by a short-lived agent that locks after 15 idle minutes (or
`--for 8h`, up to 7 days).

One command gets a repo going, and skips whatever is already done:

```bash
npx @klefsh/cli setup
```

It signs you in through the browser, links the repo to a project in your vault
(every env file in it, in `.klef.json`), unlocks, and pulls the files that are
not on disk yet. It also offers to write a Claude Code skill
(`.claude/skills/klef/SKILL.md`) and a Cursor rule (`.cursor/rules/klef.mdc`),
so every later agent session in the repo already knows how to sync these files
and that it must never print a value. `setup claude-md agents` adds the same
block to `CLAUDE.md` and `AGENTS.md`, and `setup claude --global` installs the
skill for every project. Rerun it to refresh them; it only ever rewrites its
own marked block.

The individual commands:

```bash
npx @klefsh/cli login   # approve this machine in the browser
npx @klefsh/cli list    # see what is in your vault (--json for scripts)
npx @klefsh/cli link    # connect this directory to a project in your vault
npx @klefsh/cli pull    # write it to disk (mode 0600), reporting only a count
npx @klefsh/cli run -- npm run dev  # run with the variables; the output is redacted
npx @klefsh/cli unlock  # one passphrase for the next pulls and pushes
npx @klefsh/cli sync    # pull or push each file, whichever side changed
npx @klefsh/cli diff --all  # which keys differ, never their values
npx @klefsh/cli push --all  # every file listed in .klef.json, one confirmation
```

`link` records `.env.local` and `.env.production` when the project has them
(in the vault or in the directory), so `sync`, `pull --all` and `push --all`
cover both from then on. `sync` decides per file: a file edited here since it
last matched is pushed, a file changed in the vault since then is pulled over
the untouched local copy, and a file changed on both sides, or one this
machine has never synced, stops the whole run with a key-level diff and the
two commands that settle it. A file the vault does not have yet is created.

`klef audit` lists which key names Vercel, GitHub Actions and Cloudflare
Workers hold that your local files lack, and the reverse, so you (or an agent)
can ask "OLD_FLAG is on Vercel Production but not in `.env.production`; still
needed?". It is read-only and prints names only, through your own `vercel`,
`gh` and `wrangler` sign-ins; `--json` for agents. Klef never writes to those
platforms.

```bash
npx @klefsh/cli audit           # every platform set up in this directory
npx @klefsh/cli audit vercel --json
```

### Scripts, CI and coding agents

Every command takes `--json` and then prints exactly one object on stdout,
`{ "schema": 1, "ok": true, "data": ... }` or, on failure,
`{ "ok": false, "error": { "code", "message", "hint", "next": [...] }, "exit": n }`.
Hints and progress go to stderr. `klef status --json` is the one call an agent
needs first: account, link, lock state, each file's sync state, and the next
commands to run. `klef help <command>` shows each command's `data`, and
`klef help json` lists the error codes.

klef never prompts where nobody can answer. Under `--json`, `--no-input`,
`KLEF_NO_INPUT`, `CI`, or a detected coding agent, a command that needs a yes
stops with `confirmation_required` (exit 2) and the exact command to rerun
with `--yes`; one that needs the passphrase stops with `locked` (exit 4) and
`klef unlock` for a person to run. The rest of the exit codes:

| Code | Meaning |
| --- | --- |
| 0 | Success, including nothing to do |
| 1 | Network, server, or unexpected failure |
| 2 | Usage error, or a confirmation nobody could give |
| 3 | Not signed in, or the token was rejected |
| 4 | Locked: the passphrase is needed |
| 5 | Conflict: both sides changed, nothing written |
| 6 | Not linked, or no such workspace, project or file |
| 10 | Differences found (`diff` and `audit`, with `--exit-code`) |

Colour follows the terminal and respects `NO_COLOR`, `FORCE_COLOR` and
`--no-color`. Shell completion: `klef completion bash|zsh|fish`. No telemetry,
no update checks.

### A new or reset Mac

Clone your repos (their `.klef.json` is committed), then:

```bash
npm install -g @klefsh/cli
klef login              # approve in the browser
klef unlock             # the passphrase, once
klef restore ~/Developer
```

`restore` finds every linked checkout under the directory, lists them for you
to confirm, and pulls their files. It only ever pulls: a checkout with a local
file that differs from the vault is left alone and named, for `klef sync` to
settle there.

A repo with other env files, or files that live elsewhere, lists them in
`.klef.json`, each with the path it lives at locally:

```json
{
  "workspace": "personal",
  "project": "lensdrop",
  "file": ".env.local",
  "environment": null,
  "files": [
    { "file": ".env.local" },
    { "file": ".env.production" },
    { "file": "mobile.env.local", "path": "apps/mobile/.env.local" }
  ]
}
```

`pnpm build:cli` produces `@klefsh/cli` in `dist/cli` (one file, no required
dependencies), and `pnpm build:core` produces `@klefsh/core` in `dist/core`.

`pull` never prints a value. There is no `--print` and no `klef get`, which is
what makes it safe to hand to a coding agent. `diff` and `sync` name keys,
never values. `run` goes one further: `klef run -- <command>` puts the
variables into the command's environment (`--from-vault` decrypts them in
memory, so nothing need be on disk) and replaces every secret value the
command prints with `[klef:redacted]`, so a key an app logs never reaches the
terminal or the agent that ran it. The agent instructions `setup` writes
point agents at it. See [`docs/AGENT_ACCESS.md`](./docs/AGENT_ACCESS.md).

## How it works (threat model in brief)

- **Zero-knowledge.** Env contents are encrypted in your browser with
  AES-256-GCM under a random per-account data-encryption key (DEK). The DEK is
  wrapped by a key derived from your master passphrase: Argon2id (19 MiB,
  t=2, per-account salt), with a PBKDF2-SHA-256 (600k) fallback where WASM is
  unavailable. The server sees only ciphertext, salts, and nonces.
- **Names plaintext, values encrypted.** Workspace/project/file names are
  stored in plaintext for navigation; only env *contents* are encrypted.
- **Auth ≠ unlock.** Logging in (Google/passkey) gets you a session; a
  separate master passphrase decrypts your data. A logged-in but locked
  client sees only ciphertext.
- **No server-side recovery.** Lose both your passphrase and your recovery
  key and the data is gone, by design. There is no reset Klef could perform,
  because Klef never has the keys.

The full cryptographic contract lives in
[`src/shared/BLOB_FORMAT.md`](./src/shared/BLOB_FORMAT.md), the parameters in
[`src/shared/constants.ts`](./src/shared/constants.ts), and a prose
walkthrough at [klef.sh/security](https://klef.sh/security).

**Klef does _not_ protect against** a compromised client device (keylogger,
malicious extension), a weak passphrase brute-forced offline, or loss of both
passphrase and recovery key.

## Develop

Node 22.18 or later, and pnpm.

```bash
pnpm install
pnpm cli help        # run the CLI from source, no build step
pnpm typecheck
pnpm test
pnpm build:cli       # dist/cli, the npm package @klefsh/cli
pnpm build:core      # dist/core, the npm package @klefsh/core
```

## Contributing

Contributions are welcome. Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md)
first: it covers how a pull request lands, the rule that the crypto contract
must stay intact, how contributions are licensed, and the DCO sign-off
(`git commit -s`) that CI enforces.

## Security

See [`SECURITY.md`](./SECURITY.md) for the threat model and how to report
vulnerabilities.

## License

[AGPL-3.0-or-later](./LICENSE).
