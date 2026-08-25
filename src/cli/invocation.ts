// SPDX-License-Identifier: AGPL-3.0-or-later
//
// How the user actually invoked us.
//
// `npx @klefsh/cli` does not put a `klef` binary on PATH, so telling someone to
// "run `klef link`" after they reached us through npx is advice that fails with
// command not found. Every suggestion the CLI prints goes through here.

/** npx runs the package out of its own cache directory. */
const NPX_MARKER = "/_npx/";

export function invocationName(argv1: string | undefined = process.argv[1]): string {
  return argv1?.includes(NPX_MARKER) ? "npx @klefsh/cli" : "klef";
}

/** A runnable command string, e.g. "npx @klefsh/cli link" or "klef link". */
export function command(sub: string): string {
  return `${invocationName()} ${sub}`;
}
