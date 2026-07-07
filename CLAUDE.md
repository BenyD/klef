# Klef - notes for Claude

## Git & GitHub workflow

- **main is PR-only.** A ruleset ("protect-main") blocks direct pushes, force
  pushes, and deletion - for everyone, including the owner. Never try to push
  to main; push a branch and open a PR (`gh pr create`).
- **Merges require the "Typecheck, test, build" CI check to pass** (from
  `.github/workflows/ci.yml`: `pnpm typecheck` + `pnpm test` + `pnpm build`).
  Zero approvals required (solo repo; bump when a second collaborator lands).
- **DCO**: PR commits should be signed off (`git commit -s`); the DCO check is
  visible on PRs but not merge-blocking today.
- Dependabot: vulnerability alerts on, auto-PRs deliberately off.

## Commands

```bash
pnpm dev                  # SPA + Worker (workerd) + local D1, one server
pnpm typecheck            # tsc for app + node configs
pnpm test                 # vitest: unit (node/happy-dom) + worker (Miniflare/D1)
pnpm build                # typecheck + vite build + prerender marketing pages
pnpm db:migrate:local     # apply D1 migrations locally
pnpm deploy               # build + wrangler deploy (production)
```

## Hard rules

- **The crypto contract is inviolable.** Blobs store the raw pasted env text
  byte-for-byte - never a re-serialized KV form. Parameters live in
  `src/shared/constants.ts`, format in `src/shared/BLOB_FORMAT.md`. Any edit
  feature must mutate text surgically (see `src/web/lib/env-table.ts`).
- **The server never sees plaintext secrets, passphrases, or unwrapped keys.**
  Encrypt/decrypt happens only in the browser (`src/shared/crypto.ts` used
  client-side). Names (workspace/project/file) are plaintext by design.
- **Auth ≠ unlock.** Better Auth session (Google/passkey) gates the API; the
  master passphrase-derived key unlocks data client-side. Keep the two gates
  separate.
- **Tests are first-class.** New behavior ships with tests. Crypto and other
  pure logic goes in small headless functions tested in isolation.

## Testing quirks

- Per-file `// @vitest-environment happy-dom` pragma selects the DOM env; the
  happy-dom version here has **no localStorage** - stub it (see
  `src/web/lib/auto-lock.test.ts`).
- Worker tests (`src/api/**`) run in real workerd via
  `@cloudflare/vitest-pool-workers` with inline test secrets from
  `vitest.config.ts`; no `.dev.vars` needed.

## Conventions

- UI: shadcn-style components over **Base UI** (not Radix) in
  `src/web/components/ui/`. Base UI gotcha: `DropdownMenuLabel` must sit
  inside a `DropdownMenuGroup`.
- Marketing pages (`/`, `/security`, `/terms`, `/privacy`) are plain-CSS
  (`marketing.css`), prerendered to static HTML at build time by
  `scripts/prerender.tsx` - keep them SSR-safe (no browser APIs at module
  scope or render time).
- Page titles use a hyphen: `Klef - ...`, never an em dash.
- Env-file style: terse `# Heading` comments only; variants mirrored.
