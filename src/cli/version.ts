// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Single source of the CLI's version: `klef --version` prints it, and
// scripts/build-cli.ts stamps it into the published package.json. Keeping one
// constant is what stops the binary and the registry disagreeing.

// Starts at 0.3.0. @klefsh/cli was published through 0.2.2 in May 2026 and
// unpublished that June, and npm reserves unpublished version numbers
// permanently, so every 0.1.x and 0.2.x below this is spent. The burned set is
// in the registry document at https://registry.npmjs.org/@klefsh%2fcli under
// time{}, which is the thing to read before choosing a number rather than
// probing one release at a time.
export const CLI_VERSION = "0.3.0";
