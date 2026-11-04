<div align="center">

<img src="./.github/assets/klef-mark.svg" alt="Klef" width="72" height="72">

# Klef

**End-to-end encrypted `.env` files your coding agent can use but never read.**

[![npm](https://img.shields.io/npm/v/@klefsh/cli?label=%40klefsh%2Fcli&color=F4823A)](https://www.npmjs.com/package/@klefsh/cli)
[![CI](https://github.com/BenyD/klef/actions/workflows/ci.yml/badge.svg)](https://github.com/BenyD/klef/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![Node](https://img.shields.io/node/v/@klefsh/cli)](https://nodejs.org)

[Website](https://klef.sh) · [Docs](https://klef.sh/docs/) · [Quickstart](https://klef.sh/docs/quickstart/) · [Security](https://klef.sh/security) · [Changelog](https://klef.sh/docs/changelog/)

</div>

---

Klef syncs your `.env` files across machines and teammates. They are encrypted
on your device before they leave it, so the server only ever stores ciphertext.
The CLI never prints a secret value, which makes it safe to hand to Claude Code,
Cursor or any other coding agent.

This repository is the code you have to trust: the `klef` CLI and the
encryption core that the klef.sh web app runs in your browser. It is exported
automatically from Klef's main repository, so every commit here is what the CLI
and the web app actually run.

## Features

- **End-to-end encrypted.** AES-256-GCM under a key derived from your
  passphrase (Argon2id). The server sees ciphertext, salts and nonces.
- **Your files, byte for byte.** Klef stores the env text exactly as you wrote
  it, comments and ordering included.
- **Safe for agents.** No command prints a value. `klef run` injects the
  variables into a command and redacts them from its output; `klef ask` gets a
  missing key from you in the browser instead of the chat.
- **Sync that doesn't clobber.** `klef sync` pushes your edits and pulls
  theirs, and stops with a key-level diff when both sides changed.
- **Teams with per-environment keys.** Give someone development and staging;
  production never reaches their machine or their agent.
- **Platform audit.** `klef audit` compares key names on Vercel, GitHub Actions
  and Cloudflare with your local files. Names only, read-only.

## Quick start

```bash
npx @klefsh/cli setup
```

In a repository, `setup` signs you in through the browser, links the repo to a
project in your vault (recorded in `.klef.json`, safe to commit), and pulls the
env files that aren't on disk yet. It also offers to write a Claude Code skill
and a Cursor rule, so every later agent session knows how the repo's env files
work.

Approving the sign-in in the browser with **Approve and unlock** (one passkey
touch, or your passphrase) also unlocks this machine. The CLI keeps the vault
key in the OS keychain, so pull, push and sync don't ask again on this device.

Install it globally to use `klef` directly:

```bash
npm install -g @klefsh/cli
```

## Use with coding agents

### Claude Code plugin

This repository is also a Claude Code plugin marketplace:

```
/plugin install klef --marketplace BenyD/klef
```

The plugin carries the same skill `klef setup` writes, for every project, plus
`/klef:setup`. On Claude Code older than 2.1.275, run
`/plugin marketplace add BenyD/klef` first, then `/plugin install klef@klef`.

### Cursor plugin

The same folder is a Cursor plugin. Until it is listed in Cursor's
marketplace, copy [`plugins/klef`](./plugins/klef) to
`~/.cursor/plugins/local/klef` and run **Developer: Reload Window**.

### Using a secret without reading it

```bash
klef run -- npm run dev                                   # every variable, output redacted
klef run --only DATABASE_URL -- sh -c 'psql "$DATABASE_URL" -c "select 1"'
klef run --from-vault -- pnpm test                        # decrypted in memory, no file on disk
```

`klef run` puts the variables into the command's environment and replaces
every value the command prints with `[klef:redacted]` before it reaches the
terminal or the agent that ran it.

### Getting a missing key without the chat

```bash
klef ask STRIPE_SECRET_KEY --reason "Stripe test checkout"
```

The env file opens in Klef in your browser with the key ready to fill in. The
agent waits, and only learns that the key is set.

See [`docs/AGENT_ACCESS.md`](./docs/AGENT_ACCESS.md) and the
[coding agents guide](https://klef.sh/docs/guides/coding-agents/).

## Commands

| Command | What it does |
| --- | --- |
| `klef setup` | Sign in, link the repo, pull what's missing, write agent instructions |
| `klef status` | Account, link, lock state and each file's sync state, in one call |
| `klef sync` | Push your edits and pull theirs; stops on a conflict |
| `klef pull` / `klef push` | Write the vault's copy to disk / save local changes as a new version |
| `klef diff` | Which keys differ between here and the vault, never their values |
| `klef run -- <cmd>` | Run a command with the variables, output redacted |
| `klef ask <NAME>` | Ask the user for a missing value in the browser |
| `klef audit` | Key names on Vercel, GitHub and Cloudflare that differ from local files |
| `klef restore <dir>` | On a new machine, pull every linked checkout under a directory |
| `klef list` | Workspaces, projects and files in your vault (names only) |
| `klef login` / `klef logout` | Approve this machine in the browser / sign out and revoke its token |
| `klef unlock` / `klef lock` | Unlock with your passphrase at the terminal / forget the key now |

`klef help <command>` shows each command's flags and its `--json` output.

## Scripts and CI

Every command takes `--json` and then prints exactly one object on stdout:

```json
{ "schema": 1, "ok": true, "data": {} }
{ "ok": false, "error": { "code": "locked", "message": "...", "next": ["klef login"] }, "exit": 4 }
```

Hints and progress go to stderr. Klef never prompts where nobody can answer:
under `--json`, `--no-input`, `CI` or a detected coding agent, a command that
needs a person stops with an error code and the exact command to run next.

| Exit | Meaning |
| --- | --- |
| 0 | Success, including nothing to do |
| 1 | Network, server, or unexpected failure |
| 2 | Usage error, or a confirmation nobody could give |
| 3 | Not signed in, or the token was rejected |
| 4 | Locked: this device needs unlocking |
| 5 | Conflict: both sides changed, nothing written |
| 6 | Not linked, or no such workspace, project or file |
| 7 | `klef ask` timed out before the value was saved |
| 10 | Differences found (`diff` and `audit`, with `--exit-code`) |

Colour follows the terminal and respects `NO_COLOR`, `FORCE_COLOR` and
`--no-color`. Shell completion: `klef completion bash|zsh|fish`. No telemetry,
no update checks.

## Configuration

A repo with several env files, or files outside the root, lists them in
`.klef.json`:

```json
{
  "workspace": "personal",
  "project": "acme",
  "file": ".env.local",
  "files": [
    { "file": ".env.local" },
    { "file": ".env.production" },
    { "file": "mobile.env.local", "path": "apps/mobile/.env.local" }
  ]
}
```

`.klef.json` holds names only and is meant to be committed.

## How it works

- **Zero-knowledge.** Env contents are encrypted on your device with
  AES-256-GCM under a random per-account data key. That key is wrapped by one
  derived from your passphrase with Argon2id (19 MiB, t=2, per-account salt),
  with PBKDF2-SHA-256 (600k) where WebAssembly is unavailable.
- **Names plaintext, values encrypted.** Workspace, project and file names are
  plaintext so the app can show navigation before you unlock.
- **Signing in is not unlocking.** Google, GitHub or a passkey gets you a
  session; only your passphrase, a passkey set up for unlock, or your recovery
  key opens the data.
- **No server-side recovery.** Lose both your passphrase and your recovery key
  and the data is gone, by design.

Klef does **not** protect against a compromised device (a keylogger or a
malicious extension), a weak passphrase brute-forced offline, or losing both
your passphrase and recovery key.

The cryptographic contract is in
[`src/shared/BLOB_FORMAT.md`](./src/shared/BLOB_FORMAT.md), the parameters in
[`src/shared/constants.ts`](./src/shared/constants.ts), and a walkthrough at
[klef.sh/security](https://klef.sh/security).

## What's in this repository

| Path | Package | What it is |
| --- | --- | --- |
| [`src/cli`](./src/cli) | [`@klefsh/cli`](https://www.npmjs.com/package/@klefsh/cli) | The `klef` command |
| [`src/shared`](./src/shared) | `@klefsh/core` | Encryption, the blob format and env-text editing, shared with the web app |
| [`plugins/klef`](./plugins/klef) | Claude Code and Cursor plugin | The Klef skill and `/klef:setup` |

`src/shared/core.ts` is the core's entry point, and
`scripts/core-boundary.test.ts` keeps it a closed set that imports nothing but
`hash-wasm`. The klef.sh server and web app live in a separate, private
repository.

## Development

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

Contributions are welcome. Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) first:
it covers how a pull request lands, the rule that the crypto contract stays
intact, how contributions are licensed, and the DCO sign-off
(`git commit -s`) that CI enforces.

## Security

See [`SECURITY.md`](./SECURITY.md) for the threat model and how to report a
vulnerability privately.

## License

[MIT](./LICENSE). Versions up to the `monorepo-final` tag, and every CLI
release before the first MIT one, remain AGPL-3.0-or-later; see
[`NOTICE`](./NOTICE).
