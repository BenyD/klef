# @klefsh/core

The part of [Klef](https://klef.sh) that touches your secrets: client-side
encryption (AES-256-GCM with an Argon2id-derived key), the blob format, the
device-unlock handshake, and the line-level env-text editing that keeps a file
byte-for-byte intact. The Klef CLI and the web app both run this code, so
reading it is how you check that the server only ever stores ciphertext.

It ships as readable TypeScript source, not a minified bundle. Import it from
a toolchain that compiles TypeScript (Vite, esbuild, tsc with
`allowImportingTsExtensions`):

```ts
import { decryptBlob, encryptBlob } from "@klefsh/core";

const blob = await encryptBlob(dek, envText); // what the server stores
const same = await decryptBlob(dek, blob);    // envText, byte for byte
```

Its one dependency is `hash-wasm`, for Argon2id. It uses Web Crypto and runs
in browsers, Node 22.18+ and Cloudflare Workers.

The format is specified in `BLOB_FORMAT.md`. Source:
[github.com/BenyD/klef](https://github.com/BenyD/klef), under `src/shared`.
