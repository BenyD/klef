// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Single source of the CLI's version: `klef --version` prints it, and
// scripts/build-cli.ts stamps it into the published package.json. Keeping one
// constant is what stops the binary and the registry disagreeing.

export const CLI_VERSION = "0.1.0";
