---
title: CLI overview
description: Install the Klef CLI, sign in, and the rules every command follows. The full command reference is on its way.
sidebar:
  order: 0
---

The Klef CLI is [`@klefsh/cli`](https://www.npmjs.com/package/@klefsh/cli): one bundled file with no required dependencies. It needs Node.js 22.18 or newer.

```bash
npx @klefsh/cli setup        # run without installing
npm install -g @klefsh/cli   # or install the `klef` command
```

:::note[Reference coming soon]
The CLI's commands, flags, `--json` output and exit codes are being reworked to follow common CLI conventions. This page will carry the full reference for every command once that lands, so it documents the new shapes rather than ones about to change. Until then, `klef help` prints the commands your installed version has.
:::

## Rules every command follows

- **No secret value is ever printed.** Not to stdout, not to stderr. There is no `klef get` and no `--print`. `pull` writes a file and reports a count; `push` reports how many lines changed; `diff` and `sync` name keys, never values.
- **The passphrase comes from the terminal.** It is read from `/dev/tty`, never from a flag, stdin or an environment variable. If the CLI cannot turn off echo on the stream it has, it refuses to prompt rather than show what you type.
- **Plaintext stays inside the working directory.** Files are written with mode `0600`, and absolute paths and `../` escapes are refused.
- **It cannot run unattended.** Every decrypt needs a person to have typed the passphrase, either for that command or into `klef unlock` within its idle window.
- **It never writes to Vercel, GitHub or Cloudflare.** `klef audit` only lists key names there.

## Where it keeps things

| What | Where |
| --- | --- |
| Access token | The OS keychain, or a `0600` file where there is none (or when `KLEF_NO_KEYCHAIN` is set) |
| Sync records | `~/.config/klef/sync-state.json`, mode `0600`: per local file, a version id, a modification time and a size |
| Unlock agent socket | `$XDG_RUNTIME_DIR`, or `~/.config/klef/run` where that is unset (as on macOS), owner-only |
| Repo link | `.klef.json` in the repo, committed, names only |

## Environment variables

| Variable | Does |
| --- | --- |
| `KLEF_API_URL` | Points the CLI at a self-hosted Klef (default `https://klef.sh`) |
| `KLEF_TOKEN` | Uses this access token instead of the stored one |
| `KLEF_NO_KEYCHAIN` | Stores the token in a `0600` file instead of the OS keychain |

## In the meantime

The guides cover the everyday commands:

- [Quickstart](/docs/quickstart/): `setup`
- [Syncing `.env.local` and `.env.production`](/docs/guides/sync/): `sync`, `diff`, `pull`, `push`, `unlock`, `lock`
- [Restoring on a new Mac](/docs/guides/new-machine/): `login`, `restore`
- [Using Klef with Claude Code and Cursor](/docs/guides/coding-agents/): `setup` targets
- [Auditing Vercel, GitHub and Cloudflare](/docs/guides/audit/): `audit`
