---
title: Self-hosting on Cloudflare
description: Run your own Klef on your own Cloudflare account, and point the CLI at it.
sidebar:
  order: 5
---

Klef is one repository that deploys as one Cloudflare Worker with a D1 database. Hosting it yourself is a first-class use case, and the zero-knowledge guarantee holds the same way: as the operator, you still cannot read anything stored in it.

## What you need

- A Cloudflare account, with a domain on it if you want a custom one
- Node.js 22.18 or newer and [pnpm](https://pnpm.io)
- A Google OAuth client and a GitHub OAuth app, for sign-in

## Deploy

```bash
# 1. Fork and clone the repo, then install
pnpm install

# 2. Sign Wrangler in to your Cloudflare account
pnpm exec wrangler login

# 3. Create your own D1 database and put its id in wrangler.jsonc
pnpm exec wrangler d1 create klef-db

# 4. Apply the schema to it
pnpm db:migrate:remote

# 5. Set the production secrets (never committed)
pnpm exec wrangler secret put BETTER_AUTH_SECRET    # openssl rand -base64 32
pnpm exec wrangler secret put BETTER_AUTH_URL       # https://your-domain
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
pnpm exec wrangler secret put GITHUB_CLIENT_ID
pnpm exec wrangler secret put GITHUB_CLIENT_SECRET

# 6. Build and ship
pnpm deploy
```

Before deploying, edit `wrangler.jsonc`:

- `d1_databases[0].database_id`: the id from step 3.
- `routes`: your own domain in place of `klef.sh`, or remove the block to use the `workers.dev` address. With `custom_domain: true`, Cloudflare creates the DNS record and certificate on deploy.

## OAuth callbacks

| Provider | Where | Callback URL |
| --- | --- | --- |
| Google | [Google Cloud Console](https://console.cloud.google.com/apis/credentials), OAuth client | `https://your-domain/api/auth/callback/google` |
| GitHub | GitHub, Settings, Developer settings, OAuth Apps | `https://your-domain/api/auth/callback/github` |

Passkeys are tied to the domain in `BETTER_AUTH_URL`, so set it to the address people will use.

## Point the CLI at it

```bash
export KLEF_API_URL=https://your-domain
klef login
```

`KLEF_API_URL` defaults to `https://klef.sh`. Everything else works the same.

## Updating

Pull the upstream changes into your fork, then:

```bash
pnpm db:migrate:remote
pnpm deploy
```

Migrations live in `db/migrations` and apply in order. Stored data never needs re-encrypting: the crypto format is versioned, and newer code reads older versions.

## Running it locally

```bash
pnpm install
cp .dev.vars.example .dev.vars     # fill in the auth secrets
pnpm db:migrate:local
pnpm dev                           # http://localhost:5173
```

One dev server runs the web app and the Worker, against a local D1.
