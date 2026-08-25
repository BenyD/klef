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
import { closeSync, openSync } from "node:fs";
import { ReadStream, WriteStream } from "node:tty";

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

/**
 * Suppressing the echo of a secret needs raw mode, and raw mode needs a stream
 * the terminal driver recognises. `fs.createReadStream("/dev/tty")` is not
 * one: it has no isTTY and no setRawMode, so readline cannot turn the kernel's
 * echo off and every character typed is printed to the screen and into
 * scrollback. Opening the same device through node:tty gives a stream that
 * can. Anything that fails this check refuses to prompt rather than leaking.
 */
function ttyStreams(): Tty {
  let inFd: number;
  let outFd: number;
  try {
    inFd = openSync("/dev/tty", "r");
    outFd = openSync("/dev/tty", "w");
  } catch {
    throw new NoTerminalError();
  }

  const input = new ReadStream(inFd);
  const output = new WriteStream(outFd);

  if (!input.isTTY || typeof input.setRawMode !== "function") {
    input.destroy();
    output.destroy();
    closeSync(inFd);
    closeSync(outFd);
    throw new NoTerminalError();
  }

  return {
    input,
    output,
    close: () => {
      input.destroy();
      output.destroy();
    },
  };
}

function openTty(): Tty {
  if (process.platform === "win32") {
    // No /dev/tty. Fall back to the process's own terminal streams, which is
    // only safe because Windows has no equivalent handle to open.
    if (!process.stdin.isTTY) throw new NoTerminalError();
    return { input: process.stdin, output: process.stdout, close: () => {} };
  }

  return ttyStreams();
}

/**
 * Prompt without echoing. The typed characters are suppressed rather than
 * masked: a length-revealing row of asterisks is information a shoulder-surfer
 * doesn't need.
 */
export async function promptSecret(question: string): Promise<string> {
  const tty = openTty();

  // Belt and braces: readline turns echo off through raw mode, and a stream
  // that cannot do that would print the secret. Never prompt on one.
  const input = tty.input as Partial<ReadStream>;
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    tty.close();
    throw new NoTerminalError();
  }

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
