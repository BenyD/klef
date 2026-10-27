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
- Anything a process running as you can do on a device where the CLI is
  unlocked. Once a device is unlocked (at `klef login` or with `klef unlock`),
  the vault key is kept in its OS keychain until `klef lock`, so any process
  running as your user there can decrypt the vault. See "The CLI's remembered
  key" below for why that is the right default, and how to opt out.

## Staying signed in and staying unlocked

Klef has two gates and they are remembered separately.

- **Sign-in** is a Better Auth session cookie (`HttpOnly`, `Secure`,
  `SameSite=Lax`) that lasts 30 days and slides forward when used, at most
  once a day. It reaches ciphertext and plaintext names, never a value. To
  spare a database lookup on every request, a signed copy of the session is
  cached in a second cookie for 5 minutes, so a session revoked from another
  device keeps working on this one for up to 5 minutes.
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

`klef run` is the one command that hands values to something else: the
program it starts gets them in its environment, and that program's output is
passed through unmasked. klef prints no value itself; the program can. Agent
instructions tell agents never to run one that prints a variable, and to use
`klef run` rather than opening the env file, which would put every value in
their context at once.

- **It never prints a secret value.** There is no `klef get`, no `--print`.
  `pull` writes a file at mode `0600` and reports a count; `push` reports how
  many lines changed. Errors are redacted on the way out as a backstop.
- **It reads the passphrase from `/dev/tty`, never stdin or a flag.** A process
  that spawned the CLI cannot supply or observe it, and there is no flag to
  leak into `ps` or shell history. If it ends up on a stream whose echo it
  cannot disable, it refuses to prompt rather than printing what you type.
- **A person unlocks each device.** A device decrypts only after a person
  approved `klef login` in the browser with their passkey or passphrase, or
  typed the passphrase into `klef unlock` at a terminal. Nothing an agent or a
  script can do substitutes for that step; once it is done, the device stays
  unlocked until `klef lock`. The agent orchestrates, a person unlocks.
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

## Auditing Vercel, GitHub and Cloudflare

`klef audit` compares key names in local env files with what Vercel, GitHub
Actions and Cloudflare Workers hold. It is built to be safe to hand an agent:

- **Read-only, everywhere.** It runs only listing commands (`vercel env ls`,
  `gh secret list`, `wrangler secret list`) and has no code path that writes to
  a platform. Klef never pushes to these platforms at all.
- **Names only.** GitHub and Cloudflare return names. Vercel's listing also
  carries the values of variables that are not Sensitive; those are parsed in
  memory, dropped, and never printed or written. Local files are read for key
  names, and their values are discarded the same way. No vault unlock needed.
- **Your sign-ins, not Klef's.** It runs your own `vercel`, `gh` and
  `wrangler` (wrangler from the project's `node_modules/.bin` first). Klef
  never reads, stores or forwards their tokens, and the Klef server is not
  involved. It trusts those tools exactly as much as you do when you run them.
- **Failures stay quiet.** A missing CLI, a signed-out tool or a missing
  environment is reported per platform. Only the last line of the tool's
  stderr is shown, never its stdout, and any `NAME=value` in that line is
  redacted.

## Unlocking the CLI at sign-in

Approving `klef login` can also unlock the CLI ("Also unlock the CLI on this
device", ticked by default). The design keeps every property above:

- **The browser's key stays non-extractable.** The tab cannot read the key it
  holds, so the approval page recovers the DEK's bytes the way an unlock does,
  from a passkey's PRF secret or the passphrase (both typed or touched in the
  browser, never sent anywhere), seals them, and zeroes them.
- **Sealed to the CLI, end to end.** The CLI generates a P-256 key pair for
  each login and sends only the public half. The page seals the DEK to it
  (ECDH with an ephemeral key, HKDF-SHA-256 with its own `info`, AES-256-GCM).
  The server stores the sealed blob beside the sealed token; without the CLI's
  private key, which never leaves the CLI, it is opaque to the server, the
  operator and anyone reading the database.
- **Bound to this approval.** The ciphertext's additional data binds the user
  code shown on both screens, the approving user's id, and the CLI's public
  key. Opened against any other code, user or device, it fails to decrypt.
  The device code would be the natural binding, but the browser never sees it
  (the server keeps only its hash), so the user code and user id stand in.
- **Single use, short-lived.** It is returned once, on the CLI's collecting
  poll, and cleared in the same update; an uncollected one is wiped with the
  request's token when the request expires (10 minutes).
- **The code comparison matters more.** Someone who got their own `klef login`
  approved by you would now receive your key as well as a token. The page
  shows the code and the requesting machine and says to check them; unlocking
  needs your passkey or passphrase as a deliberate second step.

## The CLI's remembered key

Once a device is unlocked, the CLI keeps the DEK in the OS keychain (macOS
Keychain, Windows Credential Manager, libsecret), or a `0600` file in the
config directory where there is none, and imports it as a non-extractable
`CryptoKey` each time it is used. `pull`, `push`, `sync`, `diff` and
`restore` then never ask for the passphrase on that device, which is what lets
a coding agent work without a person typing anything into a terminal.

- **The trade-off.** Anyone who can run commands as this user on this machine
  can decrypt the vault. That is the reach they already have over the `.env`
  files `pull` wrote there, which are the same secrets in plaintext. It is not
  a server-side weakening: a leaked access token, or the server's whole
  database, still decrypts nothing, because neither ever holds the key.
- **Scoped.** One key per server, tagged with a fingerprint of the vault's
  recovery wrapping, which a passphrase change leaves alone (the DEK does not
  change) and a new vault replaces. A key for another vault is passed over; a
  key that fails to decrypt is forgotten.
- **Forgotten** by `klef lock` and `klef logout`.
- **Opt out** with `klef login --no-remember`, `{ "rememberKey": false }` in
  `~/.config/klef/config.json`, or `KLEF_NO_REMEMBER=1` for one run. The
  unlock agent (below) and `klef unlock --for` then hold the key in memory
  only, for a while.

## The unlock agent

`klef unlock --for <time>`, or `klef unlock` with remembering turned off,
asks for the passphrase once and starts a background process that holds the
data key in memory, so later `pull` and `push` runs do not prompt, without
keeping it anywhere. It is built like `ssh-agent`:

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
reading the database, including the operator. Collection is single use. The
vault key, when the browser also unlocked the CLI, travels the same way (see
"Unlocking the CLI at sign-in").

## Handling rules the code follows

- Encryption keys exist only on the client during an unlocked session: in
  memory, and in IndexedDB as a non-extractable key until the auto-lock window
  ends (see "Staying signed in and staying unlocked").
- No key material, passphrase, or plaintext is ever sent to the server or logged.
- Locking clears keys from memory, in the browser and in the CLI's unlock
  agent alike; in the CLI it also forgets the key kept in the keychain.
- Key material is imported as non-extractable `CryptoKey` objects where the flow
  allows.
- Access tokens are stored as SHA-256 hashes; the token itself is shown once.
- The CLI keeps its token, and once a device is unlocked its vault key, in the
  OS keychain, falling back to `0600` files.
