// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Reading secrets from the human.
//
// Deliberately reads /dev/tty rather than stdin. The CLI is expected to be run
// by coding agents, which own the child process's stdin — reading from stdin
// would let the calling agent supply, or observe, the passphrase. /dev/tty is
// the terminal itself, which the agent does not have.
//
// For the same reason there is no --passphrase flag anywhere in this CLI:
// argv is visible to `ps` and to the process that spawned it.

import { createInterface } from "node:readline";
import { createReadStream, createWriteStream } from "node:fs";
import type { ReadStream, WriteStream } from "node:fs";

export class NoTerminalError extends Error {
  constructor() {
    super(
      "This needs an interactive terminal. Run it yourself rather than through a script or agent.",
    );
  }
}

interface Tty {
  input: ReadStream | NodeJS.ReadStream;
  output: WriteStream | NodeJS.WriteStream;
  close: () => void;
}

function openTty(): Tty {
  if (process.platform === "win32") {
    // No /dev/tty. Fall back to the process's own terminal streams, which is
    // only safe because Windows has no equivalent handle to open.
    if (!process.stdin.isTTY) throw new NoTerminalError();
    return { input: process.stdin, output: process.stdout, close: () => {} };
  }

  try {
    const input = createReadStream("/dev/tty");
    const output = createWriteStream("/dev/tty");
    return {
      input,
      output,
      close: () => {
        input.close();
        output.close();
      },
    };
  } catch {
    throw new NoTerminalError();
  }
}

/**
 * Prompt without echoing. The typed characters are suppressed rather than
 * masked: a length-revealing row of asterisks is information a shoulder-surfer
 * doesn't need.
 */
export async function promptSecret(question: string): Promise<string> {
  const tty = openTty();

  const rl = createInterface({
    input: tty.input,
    output: tty.output,
    terminal: true,
  });

  // Suppress echo for everything except the prompt itself.
  let muted = false;
  const realWrite = (
    rl as unknown as { _writeToOutput: (s: string) => void }
  )._writeToOutput.bind(rl);
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (
    chunk: string,
  ) => {
    if (!muted) realWrite(chunk);
  };

  try {
    return await new Promise<string>((resolve) => {
      rl.question(question, (answer) => {
        tty.output.write("\n");
        resolve(answer);
      });
      muted = true;
    });
  } finally {
    muted = false;
    rl.close();
    tty.close();
  }
}

/** Yes/no confirmation, echoed normally. Defaults to no. */
export async function confirm(question: string): Promise<boolean> {
  const tty = openTty();
  const rl = createInterface({ input: tty.input, output: tty.output, terminal: true });
  try {
    const answer = await new Promise<string>((resolve) => {
      rl.question(`${question} [y/N] `, resolve);
    });
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
    tty.close();
  }
}
