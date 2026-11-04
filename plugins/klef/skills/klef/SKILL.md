---
name: klef
description: "Use whenever a task touches this project's env files, environment variables, API keys or other secrets: run the app or a script with them (klef run), get a missing value from the user without it entering the chat (klef ask), and sync .env files with the Klef vault (status, sync, pull, push), never reading or printing a secret value."
---

<!-- klef:start (managed by klef setup; edits inside are replaced) -->
## Klef: env files for this project

This project's environment files (for example `.env.local` and
`.env.production`) are synced through Klef (https://klef.sh), an end-to-end
encrypted vault. Use the `npx @klefsh/cli` CLI for them. It never prints a secret
value, which is what makes it safe for you to run.

### Never read a secret value

- Never open, cat, print, grep, summarise, or commit an env file yourself,
  and never echo a variable's value. Refer to variables by name only.
- If you need to know which keys a file defines, ask the user, or read
  `.env.example` if there is one. Listing which env files exist (their
  names, with `ls -a`) is fine; opening them is not.
- Never ask the user for their master passphrase or access token, and never
  pipe or pass one to the CLI. It reads the passphrase from the terminal on
  purpose, so it cannot pass through you.
- In a team project, an error with the code `no_access` means the user's
  access does not cover that environment (often production). Tell the user;
  don't look for the values another way, and don't use `ask` to get them.
  Carry on with what your access does cover. A team admin can change it.
- To start the app, run the tests, or run any script that needs the
  variables, use `npx @klefsh/cli run -- <command>` instead of reading the file:
  it puts the variables straight into that command's environment, and
  replaces any secret value the command prints with `[klef:redacted]`
  before it reaches you. With `--from-vault` it needs no file on disk
  at all. Pull only when a tool reads `.env` itself and cannot take
  the environment.

### When you need a value that isn't there

Never ask the user to paste a secret into the chat, and never write one into
a file yourself. If a task needs a variable the env file lacks (or one the
user says is wrong), ask for it through Klef:

    npx @klefsh/cli ask STRIPE_SECRET_KEY --reason "Stripe test checkout" --json

It opens that env file in Klef in the user's browser, with the key ready to
fill in (the link is also printed on stderr: pass it on if no browser
opened), and waits up to 15 minutes for them to save it. It goes into the
vault and the local env file, and you only learn that it is set. Tell the
user to look for the browser tab, then wait for the command; don't run it
twice. Exit 0: carry on with `npx @klefsh/cli run -- <command>`. `timed_out`
(exit 7): check with the user before asking again, never ask for the value
in chat. `locked` (exit 4): handle it as below, then ask again.

### Using a value without reading it

When a task needs a variable's value (testing an API key, running a query
against `DATABASE_URL`, starting the app), never open the env file. Run the
command through Klef, which puts the variables in its environment:

    npx @klefsh/cli run -- npm run dev
    npx @klefsh/cli run --only ANTHROPIC_API_KEY -- node scripts/check-key.js
    npx @klefsh/cli run --only DATABASE_URL -- sh -c 'psql "$DATABASE_URL" -c "select 1"'
    npx @klefsh/cli run --from-vault -- pnpm test

Wrap any `$NAME` in `sh -c '...'` with single quotes, so your own shell does
not expand it (to nothing) before Klef runs. Klef prints no value, and masks
every value from the file in the command's output; still prefer commands that
report success or failure over ones that print a variable (`echo`, `env`,
`printenv`, a debug log of its config), and never pass `--no-redact`.

### Which files are synced

`.klef.json` (safe to read and commit: names only) links this directory to a
project in the vault. `file` is the default env file, and the optional
`files` list is everything `--all` covers, each with the local `path` it
lives at. If it sets `minVersion` and a command says the CLI is older than
that, run it as `npx @klefsh/cli@latest <command>` instead.

### Start with status

Run `npx @klefsh/cli status --json` first. In one call, without the passphrase, it
says who is signed in, what this directory is linked to, whether the vault is
unlocked, each file's state (`in-sync`, `edited-here`, `changed-in-vault`,
`missing-here`, ...), and `next`: the commands that would move things on.

Follow `next` in the order given. When `vault.unlocked` is false, `next`
starts with `login`: run it first (the user approves in the browser, which
unlocks this device), even when every file is in sync, before anything that
reads or writes values. In a directory that is not linked, `localEnvFiles`
lists the env files here by name; when it is empty, `next` has no `setup`,
because there is nothing to link.

### When there is nothing to sync

If this directory is not linked and has no env file, there is nothing to
sync. A `.env.example` alone doesn't change that: it lists key names, not
values, and is not vault content. Don't create an env file, don't look for one
elsewhere on the machine, and don't make up keys. Tell the user, and ask
whether they want Klef set up for keys they will add later, or meant another
repository.

### Linking the right project

Never guess which vault project a repository belongs to. Run
`npx @klefsh/cli list --json` to see the projects that exist (each row is a file, with
its workspace and project), ask the user which one, then link it with
`npx @klefsh/cli setup --workspace <workspace> --project <project>` (`--workspace` can
be left out when the project name is unique). Plain `setup` links on its own
only when it can tell (the one project, named like this repo); otherwise it
stops with `choice_required` and the projects in `data.choices`.
If none fits, the user creates the project in the Klef web app first (klef.sh,
or their own Klef server: New project), then you link it; the CLI does not
create projects. You may suggest the repository's name for it, but ask.

### What belongs in the vault

Klef syncs the env files that already exist (`.env`, `.env.local`,
`.env.production`, `.dev.vars` and the like). Don't move other settings into
the vault on your own: a mode switch or feature flag that lives in code or
docs stays there unless the user asks.

### When the request is unclear

If the user asks to get their env "into Klef" (or similar) and it isn't
clear whether that means pushing local files, pulling the vault's copy, or
linking an empty project, and there are no local env files, ask one question
before running anything.

### Commands

    npx @klefsh/cli status --json         # the one call to start with
    npx @klefsh/cli run -- npm run dev    # run with the variables, output redacted
    npx @klefsh/cli ask NAME --json       # the user enters a missing value in the browser
    npx @klefsh/cli sync --dry-run --json # what a sync would do, writing nothing
    npx @klefsh/cli push --all --json     # without --yes: stops with each file's counts
    npx @klefsh/cli sync --yes            # pull or push each file, whichever side changed
    npx @klefsh/cli diff --all --json     # which keys differ (names, never values)
    npx @klefsh/cli pull --all            # write every file in .klef.json to disk
    npx @klefsh/cli push --all --yes      # save local changes as new versions
    npx @klefsh/cli list --json           # every file, with its workspace and project

With `--json` every command prints one object: `{ "ok": true, "data": ... }`,
or `{ "ok": false, "error": { "code", "message", "next": [...] } }`. Act on
`error.code`, not on the wording, and run `next` commands as they are. The
exit code says the same (`npx @klefsh/cli help exit-codes`). klef never prompts an
agent: where it would need a person, it stops with one of these codes.

- **`locked` or `no_terminal` (exit 4)**: this device is not unlocked
  yet. Run `npx @klefsh/cli login` and tell the user to approve it in the browser
  with "Approve and unlock" (one passkey touch, or
  their passphrase, typed in the browser and never in the chat). The CLI
  then keeps the key on this device and pull, push and sync stop asking.
  If the user prefers, they can run `npx @klefsh/cli unlock` in their own terminal
  instead. Either way, wait for them; never retry in a loop.
- **`confirmation_required` (exit 2)**: the command writes something and
  needs a yes. Say what will change (the plan is in `data`: the files and
  what happens to each), get a yes in the chat, then run the `next`
  command, which adds `--yes`.
- **`choice_required` (exit 2)**: the command needs the user to choose,
  such as which project `setup` should link. The options are in
  `data.choices`. Ask the user, then run the `next` command with their pick
  filled in. It is not a yes, so don't add `--yes` for it.
- **`conflict` (exit 5)**: both sides changed and nothing was written. Show
  the user which keys differ (in `data`) and let them choose: `next` holds
  the pull and push that keep one side whole, and `npx @klefsh/cli sync --merge
  --dry-run` shows what merging by key would give each side. A whole-file
  push or pull drops the other side's extra keys, so prefer the merge when
  both sides added keys. A key whose value differs needs the user: they
  settle it with `npx @klefsh/cli set NAME` (which prompts them, not you) or
  choose a side.
- **`not_signed_in` (exit 3)**: run `npx @klefsh/cli setup`. Sign-in opens the
  browser for the user to approve.
- **`not_linked` (exit 6)**: link as "Linking the right project" above
  says. Exit codes are shared (`confirmation_required` and `choice_required`
  are both 2), so always act on `error.code`.
- **Before pushing**, say which files will change and get a yes in the chat,
  then use `--yes`. Push reports only how many lines changed, and every
  earlier version is kept, so a bad push can be restored in the web app.
- **Before pulling** over a file the user may have edited, ask first: pull
  overwrites the local copy and that cannot be undone. `sync` is the safe
  choice: it never pulls over a local edit.
- After a pull, check git does not track what it wrote:
  `git ls-files --error-unmatch <path>` should fail for every env file. If
  one is tracked, tell the user straight away, and offer to add it to
  `.gitignore` and untrack it (`git rm --cached <path>`) once they say yes.
- `npx @klefsh/cli help <command>` shows a command's flags and its `--json` shape.
  Newer versions may add commands; the same rules apply to every one.

### Deploy platforms (Vercel, GitHub, Cloudflare)

Syncing the local env files with Klef (status, pull, push) is routine; do it
whenever the work calls for it. The platforms are different: Klef only
audits them, read-only, comparing the variable names set on each platform
with the local file, with `npx @klefsh/cli audit --json`:

- Run it when it is relevant: setting up a project, a deploy failing on a
  missing variable, or the user asking.
- Report the names that exist only on a platform or only locally, and ask the
  user whether each one is still needed ("Vercel has STRIPE_KEY but
  .env.local does not; is it still used?").
- Never copy a value between places, and never change a platform's variables
  yourself. Names only, in both directions.

To refresh these instructions, run `npx @klefsh/cli setup claude cursor` (only the
targets you use). With targets, setup writes only these instruction files:
it never links the directory or writes `.klef.json`, and it asks before
writing, with the files in `data.agentFiles`.
<!-- klef:end -->
