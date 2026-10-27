# Klef agent access

How a CLI and, later, an MCP server reach the vault without weakening the
zero-knowledge contract.

**Status:** phases 1 to 3 shipped, plus browser sign-in, which was not in the
original plan, the unlock agent from §6 with `push --all` / `pull --all`, and
`sync` / `diff` / `restore`. The MCP server is not built.
See [What shipped](#what-shipped) for the current state and
[What is left](#what-is-left) for the rest.

The design below is kept as written, including the parts that turned out to be
wrong, because the reasoning is what makes the shape defensible. Where reality
diverged it is marked inline.

---

## What shipped

| | |
|---|---|
| Access tokens | `db/migrations/0012_access_tokens.sql`, `src/api/access-token.ts`, `src/api/tokens.ts` |
| Token management UI | Settings → Security → Developer |
| CLI | `src/cli/` — `login`, `logout`, `status`, `link`, `pull`, `push`, `run`, `unlock`, `lock` |
| Unlock agent | `src/cli/agent.ts`, `agent-client.ts`, `agent-spawn.ts`, `socket-dir.ts`, `vault-key.ts` |
| Agent timeout | `klef unlock --for 8h`: 15 minutes by default, up to 7 days (`MAX_LOCK_MINUTES` in `src/shared/lock-policy.ts`) |
| Multi-file sync | `files` in `.klef.json` (`src/cli/project-config.ts`), `push --all`, `pull --all` |
| Two-way sync | `sync`, `diff`, `restore`; `src/cli/sync-plan.ts` decides, `project-sync.ts` carries it out, `sync-state.ts` remembers |
| Default files | `link` records `.env.local` and `.env.production` (`src/cli/default-files.ts`) |
| Platform audit | `klef audit [vercel\|github\|cloudflare] [--json]`: key names only, read-only (`src/cli/audit.ts`) |
| Run without a file | `klef run -- <command>`: the file decrypted in memory and injected into the child's environment, values masked in its output (`src/cli/commands/run.ts`, `redact.ts`, `env-values.ts`) |
| Machine output | `--json` on every command: one envelope with `ok`, `data` or `error.code` + `next`; fixed exit codes (`src/cli/ui.ts`, `klef help json`, `klef help exit-codes`) |
| Published package | `@klefsh/cli`, one bundled file, zero required dependencies |
| Browser sign-in | `db/migrations/0013_device_authorizations.sql`, `src/api/device.ts`, `/cli` |
| Agent prompts | Landing page, and per-file from the app's toolbar |

Each has been run against production, not only tested: a token authenticating,
a file pulled and decrypted locally, a version pushed byte-for-byte, and a
login approved in a browser. The unlock agent and `--all` are the exception
so far: covered by tests that spawn a real agent and run push and pull through
it, but not yet run by hand against production.

## What is left

- **The MCP server** — §9 below, the piece this document was written for.
- **The unlock agent on Windows** — named pipes with an ACL. `klef unlock`
  refuses there today, and `pull` / `push` prompt as before.

## What the build taught that the design did not

- **Browser sign-in was worth doing first.** This document proposed
  paste-a-token as the shippable option and device flow as a follow-up. Paste
  shipped, and a live token was printed in the clear by a prompt that failed
  to disable terminal echo. `fs.createReadStream("/dev/tty")` has no `isTTY`
  and no `setRawMode`, so readline could never turn the kernel echo off. The
  prompt now refuses to run at all on a stream it cannot control.
- **Sealing the token in a device flow is not optional here.** A device flow
  parks the minted token between approval and collection. Every implementation
  stores it in the clear; for Klef that would be the one place the claim about
  what the server holds quietly stopped being true. The CLI now sends an ECDH
  public key and the server seals to it. Two weaker designs were tried and
  are recorded in `src/shared/device-seal.ts`.
- **The agent cannot be handed the key; it has to unwrap it itself.** The DEK
  is a non-extractable `CryptoKey`, which no process can serialise, so a
  parent that unlocks and then forks has nothing to pass on. `klef unlock`
  derives the KEK (the slow Argon2id step) and sends those bytes to the
  detached child over the IPC channel `spawn()` opens, never argv or env; the
  child unwraps the DEK and reports back. The passphrase never leaves the
  process that read it.
- **Node has no peer-credential API.** There is no `SO_PEERCRED` or
  `getpeereid` binding, so the same-uid check below is made on the path
  instead: the socket is `0600` in a directory that must be owned by this user
  and mode `0700`, checked by the agent before it listens and by the client
  before it connects.
- **macOS has no `XDG_RUNTIME_DIR`.** The fallback is `~/.config/klef/run/`,
  a directory klef creates owner-only, rather than the config directory itself,
  whose mode it does not always control.
- **Three of four bugs were found by running it, not by testing it.** `--file`
  silently ignored on `pull`, `pull` able to write outside the working
  directory, and the echo above. All had passing tests around them.

---

## 1. Problem

Klef today is browser-only: you paste env text in, and you copy it back out on
the next machine. The [README](../README.md) states the non-goal plainly — "No
CLI, no daemon, no file watcher."

The requested use case is different: a coding agent (Claude Code, or any MCP
client) should be able to pull a project's `.env` into the working tree, and
push an updated one back, without a human doing copy-paste — and **without the
secret values ever entering the model's context window.**

That last clause is the whole design. Everything else is plumbing.

## 2. Goals

- Headless, non-browser access to the vault for a CLI and an MCP server.
- Secrets reach **disk**, never **stdout**, never a **tool result**, never the
  **transcript**.
- The zero-knowledge contract survives unchanged: the server still only ever
  stores and serves ciphertext.
- An agent can navigate, diff, pull, and push without ever being able to read a
  value — enforced by the API surface, not by asking the model nicely.

## 3. Non-goals

- Machine-to-machine / CI secret injection. That is Doppler and Infisical's job
  and requires server-side plaintext access Klef cannot provide by design.
- Team RBAC, service accounts, shared vaults.
- A `klef run -- <cmd>` runtime-injection wrapper. Tempting (it is what `op run`
  does and it keeps plaintext off disk entirely), but it is a separate feature
  with its own process-inheritance threat model. Revisit after v1.

## 4. Does this break the crypto contract?

**No.** The contract is *"the server only ever stores ciphertext"* — not *"only
a browser may decrypt."* A CLI that runs Argon2id locally and unwraps the DEK in
its own process is doing precisely what the SPA does, on a different runtime.

Two facts make this cheap rather than dangerous:

- [`src/shared/crypto.ts`](../src/shared/crypto.ts) is already written for this.
  Its header: *"Pure, headless, dependency-light (hash-wasm for Argon2id;
  otherwise native WebCrypto)."* Both dependencies run unmodified on Node 20+.
  The CLI imports the same file the browser does — no second implementation, no
  drift between them. This is the single most important reason the feature is
  tractable.
- Names are plaintext by design (workspace / project / file / environment).
  So the entire *navigation* surface is already non-secret. An agent can reason
  about structure at full fidelity while being structurally incapable of
  reading a value.

That second point is the happy accident worth designing around: the
plaintext/ciphertext split Klef already has **is** the agent/secret split this
feature needs.

## 5. Prior art

Researched rather than assumed, because the unlock story is the one decision
that is hard to reverse.

| Tool | API credential | Unlocked key material | Notes |
|---|---|---|---|
| **Doppler CLI** | OS keychain (macOS/Windows/Linux), never on disk | n/a — server holds plaintext | Token scoped to a directory subtree |
| **1Password CLI** | Session key encrypted on disk, wrapper key in shell env, **30-min inactivity expiry** | Delegated to the desktop app (biometric) | Docs recommend desktop-app integration over manual signin, which "carries known security risks on certain platforms" |
| **ssh-agent** | n/a | Held in a dedicated process; socket exposes *operations*, never the key | The canonical shape. `ssh-add -t` for lifetime |
| **HashiCorp Vault** | `~/.vault-token` or a pluggable token helper | Short-lived leased tokens | Renewal/rotation is first-class |
| **gh CLI** | OS keychain, config-file fallback | n/a | Fallback path matters for headless Linux |

Two conclusions:

1. **OS keychain for the API credential is settled practice.** Doppler and gh
   both do it; the note that `keytar` is deprecated means the binding to use is
   [`@napi-rs/keyring`](https://github.com/Brooooooklyn/keyring-node), the
   maintained Rust-backed successor.
2. **Nobody good hands the unlocked key to arbitrary CLI invocations.** They put
   it behind a process boundary (ssh-agent, 1Password desktop app) that exposes
   operations instead. 1Password explicitly steers users away from the
   env-var-session model it still supports.

## 6. Recommendation: two tiers, mirroring `auth ≠ unlock`

Klef already has two gates — a Better Auth session proves *who*, a
passphrase-derived key unlocks *data*. The storage model should mirror them
exactly, which is what makes this design feel native rather than bolted on:

| Gate | Credential | Where it lives | Lifetime |
|---|---|---|---|
| **auth** | Personal access token | OS keychain, `0600` file fallback | Long-lived, revocable, optional expiry |
| **unlock** | Unwrapped DEK | `klef-agent` process memory | Inactivity timeout, default 15 min |

### Why a PAT is safe here in a way it is not elsewhere

A stolen Doppler or Infisical service token yields **plaintext secrets** — that
is the point of those products. A stolen Klef PAT yields **ciphertext and file
names.** Without the passphrase it is inert.

This is a real, ownable security property and it should be stated in the docs
and on the marketing site: *Klef's API tokens cannot leak your secrets.* No
competitor with server-side plaintext can make that claim.

### Why an agent process for the DEK

The alternatives all fail on either safety or ergonomics:

- *Prompt every time* — safe, but unattended agent use becomes impossible; the
  agent stalls on every pull waiting for a human.
- *DEK in an env var* (the `BW_SESSION` / `OP_SESSION` model) — the agent can
  read its own environment, so the key is one `printenv` from the context
  window. This is exactly what 1Password now warns against.
- *DEK cached in the OS keychain* — survives reboots, which means an attacker
  with code execution as your user gets a silent, permanent unlock. The web app
  deliberately auto-locks after 15 minutes; persisting the DEK forever
  contradicts that posture.
- **Agent process** — the key exists only in RAM, dies with the process, honours
  the same inactivity deadline as the browser, and the socket exposes
  *operations* (`decrypt this blob`) rather than the key itself.

Concretely:

- Unix socket at `$XDG_RUNTIME_DIR/klef-agent.sock`, mode `0600`; peer
  credentials checked (`SO_PEERCRED` / `getpeereid`) so only the same uid can
  connect. Named pipe with an equivalent ACL on Windows. *(Shipped with the
  check on the directory instead of the peer, since Node exposes neither call;
  `~/.config/klef/run/agent.sock` where `XDG_RUNTIME_DIR` is unset; Windows not
  yet. See "What the build taught" above.)*
- Reuse [`AUTO_LOCK_DEFAULT_MINUTES`](../src/web/lib/auto-lock.ts) (15) so CLI
  and web share one lock policy and one constant.
- `klef lock` / `klef unlock` / `klef status`, mirroring the web vault's verbs.
- Passphrase read from `/dev/tty` directly, **never** from argv, stdin, or an
  env var — argv is world-readable in `ps` and trivially readable by the agent
  that spawned the process.

## 7. Layer 1 — headless auth

New migration `db/migrations/0012_access_tokens.sql`:

```sql
create table "access_token" (
  "id"         text not null primary key,
  "userId"     text not null references "user" ("id") on delete cascade,
  "name"       text not null,              -- "laptop cli", "claude code"
  "tokenHash"  text not null unique,       -- sha-256 of the raw token
  "prefix"     text not null,              -- first 8 chars, for display
  "lastUsedAt" date,
  "expiresAt"  date,
  "createdAt"  date not null
);
create index "access_token_userId_idx" on "access_token" ("userId");
```

- **Format:** `klef_pat_` + 32 random bytes, base64url. Shown once at creation.
- **Hashing:** plain SHA-256 is correct here, *not* Argon2id. The token is
  256 bits of uniform randomness, so there is no dictionary to attack and a slow
  KDF would only add latency to every request. (Argon2id remains right for the
  passphrase, which is low-entropy and human-chosen.)
- **Middleware:** extend [`requireAuth`](../src/api/middleware.ts) to accept
  `Authorization: Bearer klef_pat_…` and fall through to the existing Better
  Auth session lookup. Same `AuthVariables` contract downstream, so every
  existing route in `vault.ts` and `structure.ts` works unchanged.
- **Account wipe** must cascade — there is already a test for this shape in
  `src/api/account-wipe.test.ts`.
- **Management UI:** create, name, list (prefix + last-used), revoke.

Endpoints reused as-is: `GET /api/tree`, `GET /api/files/:id/current`,
`POST /api/files`, `PATCH /api/files/:id`. **No new secret-bearing endpoints
are required** — the CLI is a new client of the existing ciphertext API.

## 8. Layer 2 — the CLI

Shipped:

```
klef login                       # device-code flow → PAT → OS keychain
klef logout                      # forget the stored token on this machine
klef status [--json]             # sign-in state, linked project
klef list [--json]               # what is in the vault; read-only, names only
klef link                        # bind cwd to a workspace/project (.klef.json, committed)
klef pull [--file <name>|--all]  # write .env from vault
klef push [--file <name>|--all]  # read .env, encrypt, upload as new version
klef sync [--dry-run]            # pull or push each listed file, whichever side changed
klef diff [--file <name>|--all]  # local vs stored, by key, writing nothing
klef restore [dir]               # pull every linked checkout under dir (new machine)
klef unlock                      # TTY passphrase prompt → starts klef-agent
klef lock                        # stop the agent, forgetting the key
klef audit [platform] [--json]   # key names on Vercel/GitHub/Cloudflare vs local files; read-only
```

`audit` is the one command that looks beyond Klef. It lists, never writes:
an agent can run it any time and turn `onlyOnPlatform` into a question for
the person ("X is in Vercel Production but not in `.env.production`; still
needed?"). Changing what a platform holds stays the person's call, made in
that platform's own tools.

`status` also reports whether the vault is unlocked and how long until the
agent locks (`unlocked`, `lockInSeconds` with `--json`). `pull` and `push` use
the agent when it holds this vault's key and prompt on the terminal when it
does not; `--all` covers every file in `.klef.json`'s `files` list and, without
an agent, still prompts only once. `push --all` shows every file's summary and
asks one confirmation; `-y` skips it, as for a single file.

`sync` needs to know which side changed, which the two copies alone cannot
say. Each machine keeps a record per local file in
`~/.config/klef/sync-state.json`: the vault version it last matched, and its
mtime and size at that moment. No hash of the contents: a digest of a short
env file is a guessable fingerprint of its values, and "edited since?" needs
only mtime and size. The decision table is in `src/cli/sync-plan.ts`; every
case that cannot be decided safely is a conflict, and a conflict writes
nothing to either side. A new machine has no records, so a local file there
that differs from the vault is a conflict rather than a guess; `restore`
only pulls, and leaves those for `sync`.

`list --json` is the read-only surface an agent should reach for. Until the MCP
server in §9 exists, it is the only structured output Klef offers, and it
returns exactly what the tree endpoint does — workspace, project and file
names, an environment label, and whether a file has a version to pull. No ids,
no ciphertext, nothing that needs the vault unlocked.

**The output rule, which is the entire safety story:**

> No Klef command ever writes a secret value to stdout or stderr.

`klef pull` prints `wrote 14 variables to .env`. `klef diff` prints one line
per differing key, `~ API_KEY  value differs`: the key's name, never its value. There is no `klef get VAR` and no `--print`
flag, because either one is a loaded gun pointed at a context window. If a human
genuinely needs to eyeball a value, that is what the web app is for.

`.klef.json` (committed, no secrets):

```json
{ "workspace": "personal", "project": "klef", "file": ".env", "environment": "development" }
```

With more than one file, an optional `files` list names each one and where it
lives locally (`path` defaults to the vault name and goes through the same
stay-in-this-directory check as `--path`):

```json
{
  "workspace": "personal", "project": "lensdrop", "file": ".env.local", "environment": null,
  "files": [
    { "file": ".env.local" },
    { "file": ".env.production" },
    { "file": "mobile.env.local", "path": "apps/mobile/.env.local" }
  ]
}
```

Written files get mode `0600`.

## 9. Layer 3 — the MCP server

Ships as `klef mcp` (stdio transport), so there is one binary and one auth path.

| Tool | Returns | Never returns |
|---|---|---|
| `klef_status` | lock state, linked project, TTL | — |
| `klef_list` | workspace / project / file names, environments | — |
| `klef_pull` | `{ path, variableCount, environment, version }` | values |
| `klef_push` | `{ version, added, changed, removed }` (counts) | values |
| `klef_diff` | counts, plus **key names** if `exposeKeyNames` is on | values |

Deliberately absent: any tool that reads a value. Not "restricted" — absent, so
there is no code path that can be prompt-injected into calling it.

Current MCP security guidance converges on the same rule — never place
credentials in tool descriptions, prompts, or tool results, because a model that
has seen a secret can reproduce it, and once a value is in the window it leaks
via logs, injection, or transcripts. The mitigation for file-handoff workflows
is exactly what is proposed here: hand over the **path**, never the contents.

Every tool description should carry an explicit instruction not to read the
written file. That is a hint, not a control — the control is that no tool
returns a value — but it meaningfully reduces the common case of an agent
helpfully `cat`-ing the `.env` it just fetched.

**Key names: open question.** `DATABASE_URL` is not a secret, and showing names
makes diffs far more useful. But names leak vendor topology (`STRIPE_*`,
`OPENAI_*`). Proposal: names shown by default, `exposeKeyNames: false` to
suppress. Flagging for a decision rather than assuming. *(The CLI's `diff` and
`sync` show names: a conflict cannot be settled without knowing which keys
moved. The MCP default is still open.)*

## 10. Threat model additions

For [`SECURITY.md`](../SECURITY.md). Agent access introduces exposure the
browser flow does not have:

1. **Plaintext at rest in the working tree.** Already true of any `.env`, but
   Klef now puts it there. Mitigation: `0600`, and docs telling people to
   gitignore it.
2. **The agent socket is an unlock oracle.** Any process running as your user
   can ask it to decrypt while unlocked — the same trade ssh-agent makes.
   Mitigation: short TTL, `0600`, peer-credential check, explicit `klef lock`.
3. **Context-window leakage.** The novel one. Mitigated structurally (no tool
   returns values, no command prints them) rather than by policy.
4. **A malicious or compromised MCP client** could call `klef_pull` unprompted
   and write secrets somewhere unexpected. Mitigation: pull only ever writes to
   the path in `.klef.json` relative to cwd; no arbitrary destination paths.
5. **PAT theft** — yields ciphertext only. Worth an explicit line in the docs
   because it is a genuine advantage over every server-side-plaintext competitor.

## 11. Phasing

1. ~~**PAT auth**~~ — shipped.
2. ~~**CLI: `login` / `link` / `pull`**~~ — shipped, though without the unlock
   agent, which was folded into this phase in the plan and turned out to be
   separable. ~~**Unlock agent**~~ — shipped later on its own, with
   `unlock` / `lock`, lock state in `status`, and `push --all` / `pull --all`.
3. ~~**CLI: `push` / `diff`**~~ — shipped, with `sync` and `restore` on top.
4. **MCP server** — not built. Still the right place for it: the dangerous
   decisions are all behind it now.

## 12. Open questions

- Packaging. The CLI wants to be a single binary, but the crypto is TypeScript
  and `hash-wasm` is a WASM dependency. Node + npm install, or bundle with
  Bun's `--compile`? This affects who can actually install it.
- Device-code flow vs. paste-a-token-from-the-web-UI for `klef login`. The
  latter is a day of work; the former is much better UX.
- Does `klef push` require confirmation? A destructive overwrite driven by an
  agent with no human in the loop deserves at least a version-bump safety net —
  though the existing immutable version history already provides most of that.
- Should the agent process be able to *stay* unlocked across an agent session
  longer than 15 minutes? Long agent runs will hit the timeout mid-task.
  *(Answered: `klef unlock --for`, up to 7 days, chosen per unlock. The CLI
  does not read the web's auto-lock setting, which lives in that browser.)*
- Windows support: named pipes and DPAPI are a meaningful chunk of extra work.
  Ship Unix-first?
