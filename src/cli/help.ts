// SPDX-License-Identifier: AGPL-3.0-or-later

export const HELP = `klef - zero-knowledge .env sync

Usage:
  klef <command> [options]

Commands:
  setup              Do everything in one go: sign in, link this repo to a
                     project, teach Claude Code and Cursor to use klef, unlock,
                     and pull. Skips what is done; safe to rerun
  setup <targets>    Only write the agent instructions: claude (skill), cursor
                     (rule), claude-md, agents (AGENTS.md), or all
  login              Sign in through the browser (--paste for a token instead)
  logout             Sign out on this machine and revoke its token
  status             Show sign-in state and what this directory is linked to
  list               Show the env files in your vault (read-only)
  audit [platform]   Key names on Vercel, GitHub or Cloudflare that your local
                     files lack, and the reverse (read-only, names only)
  link [ws] [proj]   Link this directory to the vault (.klef.json); records
                     .env.local and .env.production when the project has them
  sync               Pull or push each linked file, whichever side changed;
                     stops on a conflict and shows which keys differ
  diff               Compare local files with the vault, by key, writing nothing
  pull               Write the vault's copy of the env file to disk
  push               Send this directory's env file up as a new version
  restore [dir]      On a new machine: pull every linked checkout under dir
  unlock             Ask for the passphrase once; pull and push reuse it
  lock               Forget the key now instead of when it times out
  help               Show this

Options:
  --file <name>      Which env file in the vault (pull defaults to the linked one)
  --path <path>      Which local file to read or write (default: the file's name)
  --all              Pull, push or diff every file listed in .klef.json
  --dry-run          Show what sync would do, and do none of it
  --workspace, --project <name>
                     setup: which project to link, without the menu
  -y, --yes          Skip the confirmation on push, sync, restore and setup
  --global           setup: install the Claude Code skill for every project
  --json             Machine-readable output (list, status, audit)
  --paste            Sign in by pasting a token, for machines with no browser
  --for <time>       How long unlock lasts without use: 30m, 8h, 7d (default 15m)
  -h, --help         Show this
  -v, --version      Print the version

Environment:
  KLEF_API_URL       Point at a self-hosted instance (default: https://klef.sh)
  KLEF_TOKEN         Use this access token instead of the stored one
  KLEF_NO_KEYCHAIN   Store the token in a 0600 file instead of the OS keychain

klef never prints a secret value. Pull writes to a file, push reports only how
many lines changed, diff and sync name keys but never values, and nothing
secret goes to stdout either way.
klef never writes to Vercel, GitHub or Cloudflare. \`klef audit\` only lists key
names there, through your own vercel, gh and wrangler sign-ins.
The master passphrase is read from the terminal only, never from a flag or a
pipe, so the process that spawned klef cannot supply or observe it. After
\`klef unlock\`, a background agent holds the key in memory (never on disk) and
locks after 15 minutes without use, or as long as \`--for\` says, up to 7 days.
`;
