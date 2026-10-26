---
title: Syncing .env.local and .env.production
description: The everyday loop, keeping a repo's env files and the vault in step with klef sync.
sidebar:
  order: 1
---

The common setup is one project per repo, with `.env.local` for development and `.env.production` for production. This guide keeps both in step with the vault on every machine.

:::note
The CLI's commands, flags and output are being reworked. The commands named here are current; see the [CLI reference](/docs/cli/) for exact flags once it is published.
:::

## Link the repo once

If you have not already, run setup from the repo root:

```bash
npx @klefsh/cli setup
```

Linking writes `.klef.json`. When the project has `.env.local` and `.env.production`, in the vault or on disk, both are recorded, so every later command covers both:

```json
{
  "workspace": "personal",
  "project": "my-app",
  "file": ".env.local",
  "environment": null,
  "files": [
    { "file": ".env.local" },
    { "file": ".env.production" }
  ]
}
```

**Commit `.klef.json`.** It holds names only, and it is how a new machine knows what to restore. **Do not commit the env files.** Make sure your env files are in `.gitignore` before the first pull. The agent instructions `klef setup` writes tell an agent to check this too.

### Files that live elsewhere

A monorepo, or a vault file whose local name differs, gets a `path`:

```json
"files": [
  { "file": ".env.local" },
  { "file": ".env.production" },
  { "file": "mobile.env.local", "path": "apps/mobile/.env.local" }
]
```

`file` is the name in the vault; `path` is where it lives on disk, relative to the repo. Paths must stay inside the directory: absolute paths and `../` are refused.

## Sync

```bash
klef sync
```

For each file in `.klef.json`, `sync` decides on its own:

| Local file | Vault | Result |
| --- | --- | --- |
| Edited here since it last matched | Unchanged | **Push** a new version |
| Untouched since it last matched | Changed | **Pull** over the local copy |
| Changed | Changed | **Conflict** |
| Exists, never synced on this machine, differs | Any | **Conflict** |
| Exists | Has no such file | **Create** it in the vault |

A conflict stops the whole run before anything is written to either side. `sync` prints which keys differ, by name and never by value, and the two commands that settle it: pull the vault's copy over yours, or push yours over the vault's. Because every push is a new version, choosing push loses nothing; the old version stays in the history.

### How sync knows what changed

Each machine keeps `~/.config/klef/sync-state.json` (mode `0600`). For each local file it records the vault version the file last matched, and the file's modification time and size at that moment. Not a hash of the contents: a hash of a short env file would be a guessable fingerprint of its values, and "edited since?" needs only the time and size.

## Checking without syncing

```bash
klef diff --all
```

`diff` compares each local file with the vault by key and writes nothing. A line looks like `~ API_KEY  value differs`: the key's name, never its value. `klef sync --dry-run` shows what sync would do and does none of it.

## Pulling and pushing by hand

```bash
klef pull --all   # write every linked file from the vault
klef push --all   # upload every linked file as a new version, one confirmation
```

`pull` writes each file with mode `0600` and reports a count, such as `wrote 14 variables to .env.local`. `push` shows what changed, by count, and asks before uploading.

## Unlock once per session

Every command that encrypts or decrypts needs the key. Without an unlock agent, each one asks for your passphrase at the terminal. To type it once:

```bash
klef unlock          # 15 idle minutes
klef unlock --for 8h # a working day
klef lock            # forget it now
```

See [Staying signed in and unlocked](/docs/concepts/sessions/#the-clis-unlock-agent).

## Editing in the web app

Changes made at klef.sh are new versions like any other. The next `klef sync` on each machine pulls them, as long as the local file has not been edited there in the meantime.
