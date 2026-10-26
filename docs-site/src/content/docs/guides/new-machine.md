---
title: Restoring on a new Mac
description: Bring every linked repo's env files back onto a fresh or reset machine with klef restore.
sidebar:
  order: 2
---

Because each repo commits its `.klef.json`, a new machine only needs your repos and one Klef command.

## Steps

1. **Install Node.js** 22.18 or newer, then the CLI:

   ```bash
   npm install -g @klefsh/cli
   ```

2. **Clone your repos** as usual, for example under `~/Developer`.

3. **Sign in.** This opens your browser to approve the machine:

   ```bash
   klef login
   ```

4. **Unlock**, so the passphrase is typed once for the whole restore:

   ```bash
   klef unlock
   ```

5. **Restore** every linked checkout under a directory:

   ```bash
   klef restore ~/Developer
   ```

## What restore does

`restore` walks the directory for `.klef.json` files and lists every checkout it found with the vault project it asks for. It decrypts nothing until you confirm. A cloned repo can name any workspace and project, so look at the list before you say yes.

Then it pulls each checkout's files. Restore **only pulls**:

- A file that is missing locally is written from the vault, with mode `0600`.
- A file that already exists and differs from the vault is left alone and named in the output. Settle it with `klef sync` in that checkout.

That makes restore safe to run again, and means a stale checkout can never overwrite a good version in the vault.

## On a machine without a browser

`klef login --paste` signs in with an access token you create in Settings, Security, Access tokens, instead of opening a browser. The token is read from the terminal, not from a flag.

## On Windows

The CLI runs on Windows, but the unlock agent does not yet, so `restore` and each other command ask for your passphrase themselves.
