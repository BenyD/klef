# Klef - notes for Claude

## Git & GitHub workflow

- **main is PR-only.** A ruleset ("protect-main") blocks direct pushes, force
  pushes, and deletion - for everyone, including the owner. Never try to push
  to main; push a branch and open a PR (`gh pr create`).
- **Merges require the "Typecheck, test, build" and "Check sign-off" checks
  to pass** (from `.github/workflows/ci.yml`: `pnpm typecheck` + `pnpm test`
  + `pnpm build`, plus DCO sign-off). Zero approvals required (solo repo;
  bump when a second collaborator lands). Auto-merge is enabled if you want
  a PR to merge itself when checks pass.
- **DCO is merge-blocking**: always sign off commits (`git commit -s`); web
  UI commits are signed off automatically.
- GitHub Actions are restricted to GitHub-owned and verified-creator actions
  (plus `pnpm/action-setup`); a new third-party action in a workflow needs
  allow-listing in repo settings first.
- Dependabot: weekly grouped version PRs (`.github/dependabot.yml`) with a
  7-day cooldown against fresh releases. Patch/minor PRs arm their own
  auto-merge (`.github/workflows/dependabot-auto-merge.yml`); majors wait
  for human review. Vulnerability alerts and security-update PRs are on.

## Commands

```bash
pnpm dev                  # SPA + Worker (workerd) + local D1, one server
pnpm typecheck            # tsc for app + node configs
pnpm test                 # vitest: unit (node/happy-dom) + worker (Miniflare/D1)
pnpm build                # typecheck + vite build + prerender marketing pages
pnpm db:migrate:local     # apply D1 migrations locally
pnpm deploy               # build + wrangler deploy (production)
pnpm cli <command>        # run the CLI from source (login, link, pull, push)
pnpm build:cli            # bundle the CLI into dist/cli as @klefsh/cli
```

Publishing the CLI (both parts matter: without `./` npm reads `dist/cli` as a
GitHub shorthand, and without `--access public` a scoped package publishes
restricted):

```bash
pnpm build:cli
npm publish ./dist/cli --access public
```

## The CLI

- **It never prints a secret value.** No `klef get`, no `--print`. `pull`
  writes a file and reports a count; `push` reports how many lines changed.
  This is what makes it safe to hand to an agent, so do not add a command that
  breaks it.
- **The passphrase comes from `/dev/tty`**, never stdin, argv, or an env var,
  and the prompt refuses to run on a stream whose echo it cannot disable. It
  once printed a token in the clear because that check was missing.
- **`src/cli` stays compatible with Node's type stripping** — no parameter
  properties, no enums, nothing that emits runtime code. That is why `node
  src/cli/index.ts` runs the source with no build step.
- **`src/cli` is excluded from `tsconfig.json`** and typechecked under
  `tsconfig.node.json`, which is where Node types live.
- Suggested commands go through `invocation.ts`, so a reader who arrived via
  `npx @klefsh/cli` is not told to run a `klef` binary they do not have.
- Version lives in `src/cli/version.ts`. Before choosing one, read
  `https://registry.npmjs.org/@klefsh%2fcli` — unpublished versions are
  reserved forever and `npm view` 404s once a package is unpublished.

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
- **The design language is written down** in `src/web/styles/DESIGN.md`:
  motion curves and durations, the three elevation layers, type rules. Reach
  for a token, not a literal - and see them side by side at `/dev/design`
  (dev-only, like `/dev/toasts`). No `transition-all`; use
  `transition-interactive` or name the properties.
- Marketing pages (`/`, `/security`, `/terms`, `/privacy`) are plain-CSS
  (`marketing.css`), prerendered to static HTML at build time by
  `scripts/prerender.tsx` - keep them SSR-safe (no browser APIs at module
  scope or render time).
- No em dashes in anything a user reads: page titles (`Klef - ...`),
  UI copy, CLI output, and the landing-page agent prompts. Prose in code
  comments is exempt.
- Env-file style: terse `# Heading` comments only; variants mirrored.
