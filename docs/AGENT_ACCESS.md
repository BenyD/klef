# Klef agent access

How a CLI and, later, an MCP server reach the vault without weakening the
zero-knowledge contract.

**Status:** phases 1 to 3 shipped, plus browser sign-in, which was not in the
original plan. `klef diff`, the unlock agent, and the MCP server are not built.
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
| CLI | `src/cli/` — `login`, `logout`, `status`, `link`, `pull`, `push` |
| Published package | `@klefsh/cli`, one bundled file, zero required dependencies |
| Browser sign-in | `db/migrations/0013_device_authorizations.sql`, `src/api/device.ts`, `/cli` |
| Agent prompts | Landing page, and per-file from the app's toolbar |

Each has been run against production, not only tested: a token authenticating,
a file pulled and decrypted locally, a version pushed byte-for-byte, and a
login approved in a browser.

## What is left

- **`klef diff`** — compare local against stored without writing either.
- **The unlock agent** — §6 below. Without it `pull` asks for the passphrase
  every time, so pulling two files means two Argon2id unlocks.
- **The MCP server** — §9 below, the piece this document was written for.
- **`pull --all`** — one passphrase for every file in a project, which is the
  cheap version of what the agent solves properly.

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
  connect. Named pipe with an equivalent ACL on Windows.
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

```
klef login                       # device-code flow → PAT → OS keychain
klef unlock                      # TTY passphrase prompt → starts klef-agent
klef link                        # bind cwd to a workspace/project (.klef.json, committed)
klef pull [--file <name>]        # write .env from vault
klef push [--file <name>]        # read .env, encrypt, upload as new version
klef diff                        # local vs stored, summary only
klef status                      # lock state, linked project, agent TTL
klef lock
```

**The output rule, which is the entire safety story:**

> No Klef command ever writes a secret value to stdout or stderr.

`klef pull` prints `wrote 14 variables to .env`. `klef diff` prints
`3 added, 1 changed, 0 removed`. There is no `klef get VAR` and no `--print`
flag, because either one is a loaded gun pointed at a context window. If a human
genuinely needs to eyeball a value, that is what the web app is for.

`.klef.json` (committed, no secrets):

```json
{ "workspace": "personal", "project": "klef", "file": ".env", "environment": "development" }
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
suppress. Flagging for a decision rather than assuming.

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
   separable.
3. **CLI: `push` / `diff`** — `push` shipped; `diff` is not built.
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
- Windows support: named pipes and DPAPI are a meaningful chunk of extra work.
  Ship Unix-first?
