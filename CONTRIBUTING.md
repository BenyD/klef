# Contributing to Klef

Thanks for your interest in Klef. It's a small, deliberately-scoped project, so
contributions are welcome but please read this first — especially the
[Licensing](#licensing-of-contributions) and [Sign-off](#sign-off-developer-certificate-of-origin)
sections, which apply to every contribution.

## Before you start

- For anything non-trivial, **open an issue first** to discuss the change. Klef
  is intentionally minimal and tightly scoped — a quick conversation avoids
  wasted work on something that doesn't fit.
- Small fixes (typos, docs, obvious bugs) can go straight to a PR.

## Development

Setup, scripts, and the self-hosting walkthrough live in the
[README](./README.md#develop). In short:

```bash
pnpm install
pnpm db:migrate:local
pnpm dev
```

Before opening a PR, please make sure these pass:

```bash
pnpm test         # Vitest: crypto units + Worker/D1 integration
pnpm typecheck    # tsc --noEmit (app + node configs)
pnpm build        # typecheck + production build
```

## The crypto contract is load-bearing

Klef's entire value is its zero-knowledge guarantee. The cryptographic format is
specified in [`src/shared/BLOB_FORMAT.md`](./src/shared/BLOB_FORMAT.md) and the
threat model in [`SECURITY.md`](./SECURITY.md). Changes that touch encryption,
key derivation, the blob format, or what the server is allowed to see **must**
be discussed in an issue first and must keep the contract intact. Never weaken
the "server only ever stores ciphertext" property.

If you believe you've found a security vulnerability, **do not** open a public
issue or PR — follow the disclosure process in [`SECURITY.md`](./SECURITY.md).

## Licensing of contributions

Klef is licensed under [**AGPL-3.0-or-later**](./LICENSE). Two things apply to
every contribution you submit:

1. **Inbound = outbound.** Your contributions are provided under the same
   license as the project, AGPL-3.0-or-later.

2. **Commercial-relicensing grant.** You **retain copyright** to your
   contribution. In addition to the AGPL license above, you grant **Beny Dishon
   K (the project maintainer, [@BenyD](https://github.com/BenyD))** a perpetual,
   worldwide, non-exclusive, royalty-free, irrevocable license to use,
   reproduce, modify, sublicense, and distribute your contribution — including
   the right to relicense it under **other terms, including proprietary or
   commercial licenses** — as part of Klef or a derivative of it.

Why this exists: it keeps the door open for a future hosted or commercial
edition of Klef without having to track down and re-license every past
contribution. It does not take away your rights — you keep your copyright and
can use your own contribution however you like.

## Sign-off (Developer Certificate of Origin)

Klef uses the [Developer Certificate of Origin](https://developercertificate.org/)
(DCO). It's a lightweight way for you to certify that you wrote, or otherwise
have the right to submit, the code you're contributing — no separate paperwork or
account signup.

To sign off, add the `-s` flag when you commit:

```bash
git commit -s -m "Your commit message"
```

This appends a line to your commit message:

```
Signed-off-by: Your Name <your.email@example.com>
```

Use your real name and an email you can be reached at. **Every commit in a pull
request must be signed off** — CI enforces this. If you forget, you can
retroactively sign off the commits on your branch with:

```bash
git rebase --signoff main
git push --force-with-lease
```

By signing off, you certify the following:

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```
