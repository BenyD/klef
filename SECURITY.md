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
  the same trade `ssh-agent` makes. After `klef unlock`, any process running
  as your user can ask the unlock agent to decrypt or encrypt until it locks.

## Staying signed in and staying unlocked

Klef has two gates and they are remembered separately.

- **Sign-in** is a Better Auth session cookie (`HttpOnly`, `Secure`,
  `SameSite=Lax`) that lasts 30 days and slides forward when used, at most
  once a day. It reaches ciphertext and plaintext names, never a value.
- **Unlock** needs the passphrase or an enrolled passkey. To spare a prompt on
  every reload, the browser keeps the unwrapped data key in IndexedDB as a
  non-extractable `CryptoKey`: page scripts can ask it to decrypt but cannot
  read its bytes, and it is scoped to the signed-in user. It is restored only
  while it is younger than the auto-lock setting (15 idle minutes by default),
  and locking, signing out, or auto-lock deletes it.

**Keep unlocked on this device** is an opt-in on the unlock screen that sets
auto-lock to 7 days for that browser. Clearing the box at the next unlock, or
picking a shorter auto-lock in Settings, revokes it; locking ends the current
window at once. The trade-off, stated plainly: while it is on, anyone who can
use that browser profile, or code running in Klef's origin there (an XSS, a
malicious extension with access to the site), can decrypt the vault for up to
7 days after the last use, without the passphrase. They still cannot export the
key itself, and nothing about it reaches the server. Leave it off on shared or
untrusted machines. The longer settings (8 hours, 1 day, 7 days) sit between
the existing 1 hour and "Never", so the weakest choice available is unchanged.

`klef unlock --for 8h` is the CLI's counterpart: the agent holds the key in
memory for that long without use, up to 7 days, and never on disk.

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
- **It cannot run unattended.** Every decrypt needs a human to have typed the
  passphrase at a terminal: either for this command, or into `klef unlock`
  within its idle window (15 minutes unless `--for` asked for longer, at most
  7 days). That is what makes it safe to hand to a
  coding agent: the agent orchestrates, a person unlocks.
- **`pull` and `push` stay inside the working directory.** Absolute paths and
  `../` escapes are refused, so an agent that can be talked into running either
  cannot choose where plaintext lands or which file gets uploaded.

## The unlock agent

`klef unlock` asks for the passphrase once and starts a background process
that holds the data key so later `pull` and `push` runs do not prompt. It is
built like `ssh-agent`:

- **The key lives in that process's memory only**, as a non-extractable
  `CryptoKey`. It is never written to disk, to the OS keychain, or to an
  environment variable.
- **The socket offers operations, not the key.** It answers "encrypt this" and
  "decrypt that" and has no request that returns key material.
- **The passphrase stays in the process that read it.** `klef unlock` derives
  the key-encryption key and hands that to the agent over a private IPC
  channel, never through argv or the environment.
- **Only your user can reach it.** The socket is mode `0600` inside a directory
  that must be owned by you and closed to everyone else (`$XDG_RUNTIME_DIR`, or
  `~/.config/klef/run` where that is unset, as on macOS); the CLI refuses to
  start or talk to an agent in a directory that fails that check. Node exposes
  no peer-credential API, so this directory check stands in for a same-uid
  check on the connection.
- **It locks itself** after 15 minutes without an encrypt or decrypt (the web
  vault's default) or the `--for` time you chose, on `klef lock`, and when it
  is signalled to stop. A status
  check does not count as use.

What it does not change: while it is unlocked, any process running as you can
use it, which is the trade every agent of this kind makes. `klef lock` ends that
window early.

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

- Encryption keys exist only on the client during an unlocked session: in
  memory, and in IndexedDB as a non-extractable key until the auto-lock window
  ends (see "Staying signed in and staying unlocked").
- No key material, passphrase, or plaintext is ever sent to the server or logged.
- Locking clears keys from memory, in the browser and in the CLI's unlock
  agent alike.
- Key material is imported as non-extractable `CryptoKey` objects where the flow
  allows.
- Access tokens are stored as SHA-256 hashes; the token itself is shown once.
- The CLI keeps its token in the OS keychain, falling back to a `0600` file.
