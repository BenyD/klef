# Klef for Claude Code and Cursor

[Klef](https://klef.sh) is an end-to-end encrypted vault for `.env` files.
This plugin teaches Claude Code to work with your secrets without ever
reading them.

## What it does

- **Runs your app with its secrets, not the agent.** Claude starts the app,
  tests or scripts with `klef run -- <command>`, which puts the variables in
  that command's environment and replaces any value it prints with
  `[klef:redacted]` before Claude sees the output.
- **Asks for a missing key without the chat.** When a task needs a value the
  env file lacks, Claude runs `klef ask NAME`. Klef opens the file in your
  browser with the key ready to fill in; Claude only learns that it is set.
- **Syncs env files.** `klef status`, `sync`, `pull` and `push`, with the
  rule that Claude never opens, prints or summarises an env file.
- **`/klef:setup`** signs this machine in (you approve it in the browser),
  links the repository to a project in your vault and pulls its files.

The plugin has two skills and nothing else: no hooks, no MCP server, no
scripts. Claude runs the Klef CLI through `npx @klefsh/cli`.

## Install

Claude Code:

```
/plugin install klef --marketplace BenyD/klef
```

Cursor: install **Klef** from the Cursor marketplace once it is listed. Until
then, copy this folder to `~/.cursor/plugins/local/klef` and reload the window.

## Data it sends

The plugin itself sends nothing. The Klef CLI it tells Claude to run talks
only to klef.sh (or your own self-hosted Klef server):

- **Encrypted file contents.** Env files are encrypted on your machine with
  a key derived from your passphrase. klef.sh stores ciphertext it cannot
  decrypt.
- **Names.** Workspace, project and file names, in plaintext.
- **Your account and access token.** The CLI signs in through your browser;
  the token reaches ciphertext and names only.

No secret value, passphrase or key ever leaves your machine unencrypted, and
no CLI command prints a value. The CLI's source and its encryption core are
MIT-licensed in this repository.

- Privacy policy: https://klef.sh/privacy
- Security: https://klef.sh/security
- Docs: https://klef.sh/docs/guides/coding-agents/

## Licence

MIT, see [LICENSE](../../LICENSE).
