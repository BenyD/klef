// SPDX-License-Identifier: MIT
//
// The public surface of @klefsh/core: everything that decides what gets
// encrypted and how. The CLI and the web app both run this code, and it is
// what someone reads to check that the server only ever stores ciphertext.
//
// Every file this entry reaches must stay inside src/shared and import no
// package but hash-wasm. scripts/core-boundary.test.ts enforces that, and
// that src/cli takes nothing from src/shared or src/web except through this
// graph. scripts/build-core.ts copies exactly these files into dist/core.

export * from "./constants.ts";
export * from "./types.ts";
export * from "./encoding.ts";
export * from "./crypto.ts";
export * from "./device-code.ts";
export * from "./device-seal.ts";
export * from "./device-unlock.ts";
export * from "./access-token-format.ts";
export * from "./api-types.ts";
export * from "./env-table.ts";
export * from "./env-drift.ts";
export * from "./env-from-name.ts";
export * from "./diff.ts";
export * from "./shell.ts";
export * from "./lock-policy.ts";
