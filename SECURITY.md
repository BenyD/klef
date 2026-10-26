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
  within the last 15 idle minutes. That is what makes it safe to hand to a
  coding agent: the agent orchestrates, a person unlocks.
- **`pull` and `push` stay inside the working directory.** Absolute paths and
  `../` escapes are refused, so an agent that can be talked into running either
  cannot choose where plaintext lands or which file gets uploaded.

## Sync and restore

- **`diff` and `sync` print key names, never values.** A conflict cannot be
  settled without knowing which keys moved, and a key name says what a value
  is for, not what it is. The result type they print from holds names only.
- **A pull never overwrites an edit.** `sync` pulls a vault change only over a
  local file whose mtime and size are what they were when it last matched the
  vault; anything else is a conflict, and a conflict writes nothing to either
  side. A push is safe by construction, since vault versions are append-only.
- **The record of what matched holds no secret.** `~/.config/klef/sync-state.json`
  (mode `0600`) stores, per local path, a version id, an mtime and a size. Not
  a hash of the contents, which for a short env file would be a guessable
  fingerprint of its values.
- **`restore` asks before it writes.** It walks a directory for committed
  `.klef.json` files, and a cloned repo can name any workspace and project.
  So it lists every checkout and the vault project it asks for, and decrypts
  nothing until you confirm. It only pulls, so a stale checkout cannot
  overwrite a good version.
- **A token can create an env file, not delete one.** `sync` creates a vault
  file that exists only locally, with an environment label taken from its
  name. Deleting stays browser-only.

## Vercel, GitHub Actions and Cloudflare Workers

`klef push --to vercel|github|cloudflare`, `klef status --targets` and
`klef import --from vercel` move values between Klef and a deploy platform.
Sending a value to a platform is the point, so the platform sees plaintext;
what these commands guarantee is how it gets there.

- **Decryption stays on your machine, and Klef's server learns nothing new.**
  The vault copy is decrypted here, exactly as `pull` does, and handed to your
  own `vercel`, `gh` or `wrangler`, signed in as you. Klef never reads, stores
  or forwards those tools' tokens, and sends the platforms nothing itself.
- **Values travel on a child process's stdin, never in argv**, which any
  process on the machine can read through `ps`. `vercel env add` and
  `gh secret set` get one value each on stdin; `wrangler secret bulk` gets one
  JSON object on stdin, so no file is written. `gh` seals each value to the
  repository's public key before it leaves the machine.
- **Tool output is captured, not shown.** A listing (which for Vercel can
  include readable values) is parsed in memory and never printed. When a tool
  fails, only the last line of its stderr is shown, with every value klef sent
  replaced by `<redacted>` and assignment-shaped text redacted as well.
- **Reading Vercel values touches disk briefly.** `vercel env ls` reports names
  and which variables are Sensitive but does not decrypt; only
  `vercel env pull` does, and only into a file. Klef points it at a fresh
  directory from `mkdtemp` (mode `0700`, so only you can enter it), reads the
  file into memory, and deletes the directory before going on, on success or
  failure. A crash in that window leaves the file in your temp directory,
  inside that private folder.
- **Drift reports verdicts, not values.** `status --targets` prints names
  missing on either side, and for Vercel "matches", "differs" or "can't check
  (Sensitive)" per variable. GitHub and Cloudflare secrets cannot be read back
  by anyone, so they get names only.
- **What is deployed is what Klef holds.** A push stops if the local file has
  drifted from the vault, so an unsynced edit is never deployed silently.
  Pushes add and update only: a name that exists only on the platform is
  listed and left alone, since deleting a production variable should not be a
  side effect. Each push lists where it is going and asks first (`-y` skips).
- **Import replaces nothing by default.** `import --from vercel` refuses a Klef
  file that already has a version unless `--force` is given, and then asks even
  under `-y`. The replaced version is kept. Sensitive variables cannot be read
  from Vercel and are listed for you to add by hand.
- **Trust in the tools is yours.** Klef runs `vercel`, `gh` and `wrangler` from
  your `PATH` (wrangler from the project's `node_modules/.bin` first), so it
  trusts them exactly as much as you do when you run them yourself.

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
  vault's default), on `klef lock`, and when it is signalled to stop. A status
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

- Encryption keys exist only in browser memory during an unlocked session.
- No key material, passphrase, or plaintext is ever sent to the server or logged.
- Locking clears keys from memory, in the browser and in the CLI's unlock
  agent alike.
- Key material is imported as non-extractable `CryptoKey` objects where the flow
  allows.
- Access tokens are stored as SHA-256 hashes; the token itself is shown once.
- The CLI keeps its token in the OS keychain, falling back to a `0600` file.
