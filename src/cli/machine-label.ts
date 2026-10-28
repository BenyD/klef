// SPDX-License-Identifier: AGPL-3.0-or-later
//
// How a machine is named when the CLI signs in: on the approval page, and as
// the name of the access token that login creates. The CLI owns it, since the
// CLI may import only @klefsh/core from outside src/cli. The server imports it
// too, because older CLIs send Node's raw `os.type()` ("Darwin on
// Benys-MacBook-Pro.local") and it tidies those the same way; that is why this
// file imports nothing and uses no Node APIs.

/** Node's `os.type()` values, as people call them. */
const OS_NAMES: Record<string, string> = {
  Darwin: "macOS",
  Windows_NT: "Windows",
};

/** mDNS and router suffixes that say nothing about which machine it is. */
const HOST_SUFFIX = /\.(local|lan|home|localdomain)$/i;

/** "Darwin on Benys-MacBook-Pro.local" reads "macOS on Benys-MacBook-Pro". */
export function tidyMachineLabel(label: string): string {
  const [, rawOs, rawHost] = /^(\S+) on (.+)$/.exec(label.trim()) ?? [];
  if (rawOs === undefined || rawHost === undefined) return label.trim();
  const os = OS_NAMES[rawOs] ?? rawOs;
  const host = rawHost.replace(HOST_SUFFIX, "");
  return `${os} on ${host}`;
}
