// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Quoting names for a shell command we print.
//
// Shared by the CLI (the example under a listing) and the web app (the
// commands inside an agent prompt), because two functions with this name and
// subtly different rules is how one of them quietly stops being safe.

/**
 * Quote a workspace, project or file name for a shell command.
 *
 * Always quotes, even when the name looks harmless. Names are free text, so
 * one containing a space or a quote would produce a command that silently
 * targets the wrong thing, and one containing `$()` would produce a command
 * that runs something. "Always quoted" is an invariant a reader can check at a
 * glance; "quoted when it looks necessary" is one they have to re-derive
 * against whatever the allowlist happens to say today.
 *
 * Single quotes with the standard '\'' escape, because inside them a shell
 * expands nothing at all.
 */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** True when quoting this name needs the '\'' escape, which reads badly. */
export function hasAwkwardQuoting(value: string): boolean {
  return value.includes("'");
}
