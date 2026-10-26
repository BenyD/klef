---
title: Auditing Vercel, GitHub and Cloudflare
description: Compare key names in your local env files with what your deploy platforms hold, read-only.
sidebar:
  order: 4
---

Env vars drift. A key gets added to `.env.production` and never to Vercel, or a flag stays on GitHub Actions long after the code stopped reading it. `klef audit` lists those gaps by name, in both directions, so you or an agent can ask: "`OLD_FLAG` is on Vercel Production but not in `.env.production`; is it still needed?"

```bash
klef audit             # every platform set up in this directory
klef audit vercel      # one platform: vercel, github or cloudflare
klef audit --json      # for agents and scripts
klef audit --exit-code # exit 10 when any names differ
```

With `--json`, the result is in `data.targets`: one entry per scope with `onlyOnPlatform`, `onlyLocal` and `both`, and a `status` of `ok`, `no-local-file`, `skipped` or `unavailable`. See [Commands](/docs/cli/commands/#klef-audit).

## What is compared

Each platform environment is compared with the local file for the same environment:

| Platform | Scope | Local file |
| --- | --- | --- |
| Vercel | Development | `.env.local` |
| Vercel | Preview | `.env.preview` |
| Vercel | Production | `.env.production` |
| GitHub Actions | `production` environment secrets | `.env.production` |
| GitHub Actions | Repository secrets | `.env.production` |
| Cloudflare Workers | Worker secrets | `.env.production` |

When a linked repo keeps an environment under a different name, such as production in a plain `.env` marked production, that file is used instead. See [Environments](/docs/concepts/environments/).

For each scope, audit reports the names only on the platform and the names only in the local file.

## Safe by construction

- **Read-only, everywhere.** It runs only listing commands (`vercel env ls`, `gh secret list`, `wrangler secret list`) and has no code path that writes to a platform. Klef never pushes to these platforms at all. Changing what a platform holds stays your call, in that platform's own tools.
- **Names only.** GitHub and Cloudflare return names. Vercel's listing also includes the values of variables that are not marked Sensitive; those are dropped while parsing, never printed or written. Local files are read for key names and their values discarded the same way.
- **No unlock needed.** Audit never touches the vault's encrypted contents.
- **Your sign-ins, not Klef's.** It runs your own `vercel`, `gh` and `wrangler` (wrangler from the project's `node_modules/.bin` first). Klef never reads, stores or forwards their tokens, and the Klef server is not involved.
- **Failures stay quiet.** A missing tool, a signed-out tool or a missing environment is reported per platform. Only the last line of the tool's error output is shown, never its normal output, and any `NAME=value` in that line is redacted.

## Before you start

Install and sign in to the platform CLIs you use, in the repo:

- Vercel: `vercel login`, and `vercel link` in the repo
- GitHub: `gh auth login`
- Cloudflare: `wrangler login`
