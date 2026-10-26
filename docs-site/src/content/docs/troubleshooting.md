---
title: Troubleshooting
description: Fixes for the problems people run into most with the web app and the CLI.
---

## Web app

### The passphrase is rejected

Passphrases are case-sensitive and checked on your device, so there is no server-side lockout to wait out. Check Caps Lock and your keyboard layout. If you have forgotten it, use your recovery key ("Forgot your passphrase? Use your recovery key" on the unlock screen).

### "Unlock with a passkey" does not appear

A passkey unlocks the vault only after you turn on "Unlocks vault" for it in Settings, Security, Passkeys. That needs an authenticator and browser with WebAuthn PRF support. Passkeys added only for sign-in do not unlock.

### The vault locks too often, or not often enough

Change Settings, Security, Vault, Auto-lock. The setting is per browser. "Keep unlocked for 7 days" on the unlock screen is the same as choosing 7 days. See [Staying signed in and unlocked](/docs/concepts/sessions/).

### "Couldn't load your vault"

A network error, not a problem with your data; nothing was changed. Check your connection and choose Try again.

## CLI

### "This needs an interactive terminal"

The command needed your passphrase but was not run from a terminal it can prompt on, for example when an agent or a script ran it. Run `klef unlock` yourself in a terminal; later commands, from anywhere, use the unlock agent until it locks. On Windows, where there is no unlock agent yet, run the command yourself.

### "Your access token was rejected"

The token expired or was revoked. Run `klef login` again. If `KLEF_TOKEN` is set in your environment, it takes precedence over the stored token, so update or unset it.

### `klef setup` says the vault has no env files yet

Setup links a repo to a project that already has a file. Create the project and add a file at [klef.sh](https://klef.sh), then rerun setup.

### `klef sync` stops with a conflict

Both sides changed since this machine last synced, or this machine has never synced a file that already exists locally. Nothing was written. Look at the key names it printed, then run the pull or push command it suggests. Pushing keeps the vault's previous version in the history, so you can go back. See [Syncing](/docs/guides/sync/).

### A file was not restored

`klef restore` only pulls, and never overwrites a local file that differs from the vault. It names those files; run `klef sync` in that checkout.

### "No .klef.json here"

The directory is not linked. Run `klef setup` (or `klef link`) in the repo root.

### `klef unlock` refuses to start

The unlock agent keeps its socket in a directory only your user may own and read: `$XDG_RUNTIME_DIR`, or `~/.config/klef/run` where that is unset. If the directory's owner or permissions are wrong, the CLI refuses to use it. Fix them (owner you, mode `0700`) or remove the directory and let the CLI recreate it.

### `klef audit` reports a platform as unavailable

Audit runs your own `vercel`, `gh` and `wrangler`. Install the tool, sign in to it, and for Vercel run `vercel link` in the repo. Only the last line of the tool's error is shown, with anything that looks like `NAME=value` redacted.

### The OS keychain is unavailable

On a headless Linux box, for example, set `KLEF_NO_KEYCHAIN=1` and the token is stored in a `0600` file instead.
