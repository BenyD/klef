---
title: Security model
description: What Klef protects, what it deliberately does not, and how to report a vulnerability.
---

Klef is a zero-knowledge secrets tool, so its security properties are the point of it. This page summarises the threat model; the canonical sources are [`SECURITY.md`](https://github.com/BenyD/klef/blob/main/SECURITY.md) and the crypto contract in [`BLOB_FORMAT.md`](https://github.com/BenyD/klef/blob/main/src/shared/BLOB_FORMAT.md). For a walkthrough with diagrams, see [klef.sh/security](https://klef.sh/security).

## What Klef protects

Every env file is encrypted on your device with AES-256-GCM before upload. The server stores ciphertext, salts, nonces and KDF parameters, none of which reveal a secret. Neither the server, nor whoever operates it, nor someone on the network can read your values. See [End-to-end encryption](/docs/concepts/encryption/).

## What Klef does not defend against

By design, and stated plainly:

- **A compromised device.** A keylogger, a malicious browser extension, or malware that reads memory while the vault is unlocked.
- **A weak passphrase.** Anyone with a copy of the database can try to guess it offline against your wrapped key. Argon2id makes each guess expensive, not impossible.
- **Losing both the passphrase and the recovery key.** The data is then unrecoverable, which is what zero-knowledge means.
- **Plaintext written by `klef pull`.** Writing the file is the point of the command. It is written `0600`, but after that it is an ordinary file on your machine. Keep env files out of git.
- **Other processes while the CLI is unlocked.** After `klef unlock`, any process running as your user can ask the unlock agent to decrypt or encrypt until it locks. This is the same trade `ssh-agent` makes.
- **"Keep unlocked for 7 days".** While it is on, anyone using that browser profile, or code running in Klef's origin there, can decrypt the vault without the passphrase until it lapses. See [Staying signed in and unlocked](/docs/concepts/sessions/).

## Tokens cannot leak secrets

The CLI's access token is an auth credential only. It reaches ciphertext and names, and cannot decrypt anything. A stolen Klef token is not a stolen secret, unlike a service token for a secrets manager that serves plaintext.

A token also cannot mint or revoke tokens, approve a CLI sign-in, rewrite vault key material, or delete workspaces, projects or files. Vault writes are gated by HTTP method, so a route added later is browser-only until someone deliberately opens it. Tokens are stored as SHA-256 hashes and shown once.

## The CLI

- **Never prints a secret value.** Errors are redacted on the way out as a backstop.
- **Reads the passphrase from `/dev/tty` only**, and refuses to prompt on a stream whose echo it cannot disable.
- **Cannot run unattended.** A person types the passphrase, for each command or into `klef unlock`.
- **Keeps `pull` and `push` inside the working directory.** Absolute paths and `../` are refused.
- **Signs in through the browser.** `klef login` shows a short code to compare by eye with the one in the browser; the alphabet leaves out characters people misread. Between approval and collection, the new token is sealed to a key the CLI generated, so the stored row is useless to anyone reading the database, the operator included. Collection works once.

### The unlock agent

- The key lives only in that process's memory, as a non-extractable key. Never on disk, in the keychain or in an environment variable.
- The socket offers operations, "encrypt this" and "decrypt that", and has no request that returns key material.
- The passphrase stays in the process that read it. `klef unlock` derives the key-encryption key and hands that to the agent over a private channel, not through arguments or the environment.
- Only your user can reach it: the socket is `0600` inside a directory that must be owned by you and closed to everyone else, checked by both the agent and the client.
- It locks after 15 minutes without use, or the `--for` time you chose (at most 7 days), on `klef lock`, and when it is stopped. A status check does not count as use.

## Sync, restore and audit

- **`diff` and `sync` print key names, never values.** A key name says what a value is for, not what it is.
- **A pull never overwrites an edit.** `sync` pulls only over a local file whose modification time and size are what they were when it last matched; anything else is a conflict, and a conflict writes nothing.
- **The sync record holds no secret,** not even a hash of the contents.
- **`restore` asks before it writes,** because a cloned repo's `.klef.json` can name any project. It only pulls.
- **A token can create an env file in the vault, not delete one.**
- **`audit` is read-only and names-only,** through your own platform CLIs. See [Auditing](/docs/guides/audit/).

## Handling rules the code follows

- Encryption keys exist only on the client during an unlocked session: in memory, and in IndexedDB as a non-extractable key until auto-lock.
- No key material, passphrase or plaintext is ever sent to the server or logged.
- Locking clears keys from memory, in the browser and in the CLI's unlock agent.
- The web app loads no analytics, trackers or third-party scripts.

## Can I trust the client code?

The same question applies to any end-to-end encrypted web app. Klef's answer is transparency: the whole codebase is open, the crypto is isolated in small pure functions in [`src/shared/`](https://github.com/BenyD/klef/tree/main/src/shared), and you can [host it yourself](/docs/guides/self-hosting/) to pin the code you audited.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting ("Report a vulnerability" under the [repository's Security tab](https://github.com/BenyD/klef/security)), or email the maintainer. Include the affected version or commit, the scenario and the impact.

**In scope:** anything that would let the server, operator, host or a network attacker read plaintext secrets or key material; weaknesses in the KDF, envelope or AES-GCM usage; auth bypass; cross-user data access; XSS or supply-chain issues that could exfiltrate keys from the browser.
