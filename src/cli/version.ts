// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Single source of the CLI's version: `klef --version` prints it, and
// scripts/build-cli.ts stamps it into the published package.json. Keeping one
// constant is what stops the binary and the registry disagreeing.

// Starts at 0.2.0 rather than 0.1.0: an earlier @klefsh/cli@0.1.0 was
// published and unpublished in June 2026, and npm reserves an unpublished
// version number permanently, so 0.1.x cannot be reused. Nothing was wrong
// with the artifact; the number was simply spent.
export const CLI_VERSION = "0.2.0";
