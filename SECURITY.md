# Security Policy

Klef is a zero-knowledge secrets tool, so its security properties are the whole
point. Reports of vulnerabilities are very welcome.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Instead, use
GitHub's [private vulnerability reporting](https://github.com/) ("Report a
vulnerability" under the repository's Security tab), or email the maintainer.

Include enough detail to reproduce: affected version/commit, the scenario, and
the impact. You'll get an acknowledgement as quickly as possible.

## What Klef protects

Klef encrypts every env value in your browser. The server stores only
ciphertext, salts, nonces, and KDF parameters — none of which reveal a secret.
See [the crypto contract](src/shared/BLOB_FORMAT.md) for the full design.

**In scope:** anything that would let the server, operator, host, or a network
attacker read plaintext secrets or key material; weaknesses in the KDF/envelope/
AES-GCM usage; auth bypass; cross-user data access; XSS or supply-chain issues
that could exfiltrate keys from the browser.

## What Klef does not defend against (by design)

- A compromised client device — keylogger, malicious browser extension, or
  malware that reads browser memory while the vault is unlocked.
- A weak passphrase brute-forced offline against the wrapped DEK.
- Loss of **both** the passphrase and the recovery key — data is then
  permanently unrecoverable, which is what zero-knowledge means.
- Plaintext written to disk by `klef pull`. That is the point of the command;
  the file is written `0600` and the CLI will tell you if it is tracked by git,
  but after that it is an ordinary file on your machine.
- Anything a process running as you can do while the CLI is unlocked, which is
  the same trade `ssh-agent` makes.

## Access tokens and the CLI

The CLI holds an **access token**, which is an auth credential and nothing
more. It reaches ciphertext and the plaintext names Klef stores anyway. It
cannot decrypt: that needs the passphrase-derived key, which is never
transmitted and never stored.

So a stolen Klef token is not a stolen secret. That is a real difference from
a conventional secrets manager, where a leaked service token yields plaintext
because serving plaintext is the product.

What a token deliberately cannot do:

- mint or revoke tokens, so a leaked one cannot outlive its own revocation
- authorise a CLI sign-in, for the same reason
- rewrite vault key material
- delete workspaces, projects, or files

Vault writes are gated by HTTP method rather than a path list, so a route
added later is browser-only until someone deliberately opens it.

## What the CLI will not do

- **It never prints a secret value.** There is no `klef get`, no `--print`.
  `pull` writes a file at mode `0600` and reports a count; `push` reports how
  many lines changed. Errors are redacted on the way out as a backstop.
- **It reads the passphrase from `/dev/tty`, never stdin or a flag.** A process
  that spawned the CLI cannot supply or observe it, and there is no flag to
  leak into `ps` or shell history. If it ends up on a stream whose echo it
  cannot disable, it refuses to prompt rather than printing what you type.
- **It cannot run unattended.** Every decrypt needs a human at a terminal. That
  is what makes it safe to hand to a coding agent: the agent orchestrates, a
  person unlocks.
- **`pull` and `push` stay inside the working directory.** Absolute paths and
  `../` escapes are refused, so an agent that can be talked into running either
  cannot choose where plaintext lands or which file gets uploaded.

## Signing in to the CLI

`klef login` opens the browser and waits for approval, so no token passes
through a clipboard. Starting a login and polling are unauthenticated by
necessity; approving requires a browser session and specifically not a token.

The short code is compared by eye between terminal and browser. That
comparison is the defence against someone getting their own login approved by
a stranger, so the alphabet omits characters people misread and the page says
what to check.

Between approval and collection the minted token is sealed to an ECDH public
key the CLI generated, so the stored row is not a usable credential to anyone
reading the database, including the operator. Collection is single use.

## Handling rules the code follows

- Encryption keys exist only in browser memory during an unlocked session.
- No key material, passphrase, or plaintext is ever sent to the server or logged.
- Locking clears keys from memory.
- Key material is imported as non-extractable `CryptoKey` objects where the flow
  allows.
- Access tokens are stored as SHA-256 hashes; the token itself is shown once.
- The CLI keeps its token in the OS keychain, falling back to a `0600` file.
