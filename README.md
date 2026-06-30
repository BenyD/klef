# Klef

**Personal, zero-knowledge `.env` sync.** Paste your env files in, sync them
across machines, pull them back down — all end-to-end encrypted. The server only
ever stores ciphertext; your keys never leave the browser.

> Status: **v1 feature-complete and locally usable** — auth, zero-knowledge
> crypto, vault setup/unlock, workspaces/projects/files, the paste → diff → save
> loop, and export / copy / version history + restore.

Klef is deliberately **not** an Infisical/Doppler/Vault competitor. No CLI, no
daemon, no file watcher — just a dead-simple, truly zero-knowledge env vault you
drive by hand. Self-hosting on Cloudflare is a first-class feature.

## How it works (threat model in brief)

- **Zero-knowledge.** Env contents are encrypted in your browser with AES-256-GCM
  under a key (DEK) that is itself wrapped by a key derived from your master
  passphrase (Argon2id). The server sees only ciphertext, salts, and nonces.
- **Names plaintext, values encrypted.** Workspace/project/file names are stored
  in plaintext for navigation; only env *contents* are encrypted.
- **Auth ≠ unlock.** Logging in (Google/passkey) gets you a session; a separate
  master passphrase decrypts your data. A logged-in but locked client sees only
  ciphertext.
- **No server-side recovery.** Lose both your passphrase and your recovery key
  and the data is gone — by design.

The full cryptographic contract lives in
[`src/shared/BLOB_FORMAT.md`](./src/shared/BLOB_FORMAT.md).

**Klef does _not_ protect against** a compromised client device (keylogger,
malicious extension), a weak passphrase brute-forced offline, or loss of both
passphrase and recovery key.

## Stack

Vite + React SPA (owns all crypto/diffing) · Hono on Cloudflare Workers · Better
Auth · Cloudflare D1 · Wrangler + `@cloudflare/vite-plugin`. One package, one dev
server running the SPA and the Worker against real `workerd` with a real D1
binding.

## Develop

Requires Node 20+ and [pnpm](https://pnpm.io).

```bash
pnpm install
cp .dev.vars.example .dev.vars        # fill in when Phase 1 auth lands
pnpm db:migrate:local                 # apply migrations to local D1
pnpm dev                              # http://localhost:5173
```

Other scripts:

```bash
pnpm test          # Vitest: crypto units (node) + Worker/D1 (workerd via Miniflare)
pnpm typecheck     # tsc --noEmit
pnpm build         # typecheck + production build
```

## Self-hosting

Klef is built to be forked and self-hosted on your own Cloudflare account — the
single-repo Cloudflare deploy makes this genuinely easy, and it's a first-class
use case.

```bash
# 1. Fork + clone, then install
pnpm install

# 2. Authenticate Wrangler with your Cloudflare account
pnpm exec wrangler login

# 3. Create your own D1 database, then put its id in wrangler.jsonc
pnpm exec wrangler d1 create klef-db   # copy the database_id into wrangler.jsonc

# 4. Apply the schema to your remote D1
pnpm db:migrate:remote

# 5. Set production secrets (never committed)
pnpm exec wrangler secret put BETTER_AUTH_SECRET   # openssl rand -base64 32
pnpm exec wrangler secret put BETTER_AUTH_URL      # https://your-domain
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET

# 6. Ship it
pnpm deploy
```

Create the Google OAuth client at the [Google Cloud
Console](https://console.cloud.google.com/apis/credentials) with an authorized
redirect URI of `https://your-domain/api/auth/callback/google`.

Because everything is end-to-end encrypted, the operator (you) still can't read
any stored secret — the same zero-knowledge guarantee holds whether Klef is
hosted by its author or by you.

## Contributing

Contributions are welcome — please read [`CONTRIBUTING.md`](./CONTRIBUTING.md)
first. It covers the dev workflow, the rule that the zero-knowledge crypto
contract must stay intact, how contributions are licensed, and the DCO sign-off
(`git commit -s`) that CI enforces.

## Security

See [`SECURITY.md`](./SECURITY.md) for the threat model and how to report
vulnerabilities.

## License

[AGPL-3.0-or-later](./LICENSE). Open source from the first commit — for a secrets
tool, auditability is the whole trust story.
