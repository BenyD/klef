// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The directory the unlock agent's socket lives in, and the one check that
// keeps other users out of it.
//
// docs/AGENT_ACCESS.md asks for a same-uid peer check on the socket. Node has
// no API for SO_PEERCRED or getpeereid, so the check is made on the path
// instead: the socket sits in a directory that only this user can enter, and
// is itself mode 0600. A process running as another user cannot reach it; a
// process running as you can, which is the trade ssh-agent makes too.
//
// The client runs the same check before connecting, so a socket planted in a
// directory someone else controls is never handed a plaintext to encrypt.

import { mkdir, stat } from "node:fs/promises";

const OWNER_ONLY_DIR = 0o700;

export class UnsafeSocketDirError extends Error {}

/**
 * The kernel caps a Unix socket path at 104 bytes on macOS and 108 on Linux,
 * terminator included, and Node reports overruns as a bare EINVAL. A deep
 * KLEF_CONFIG_DIR or XDG_CONFIG_HOME can cross it, so say so in words.
 */
export const MAX_SOCKET_PATH_BYTES = 103;

export function assertSocketPathFits(socketPath: string): void {
  if (Buffer.byteLength(socketPath) > MAX_SOCKET_PATH_BYTES) {
    throw new UnsafeSocketDirError(
      `The unlock agent's socket path is too long for the OS (${socketPath}). ` +
        "Set KLEF_AGENT_SOCK to a shorter path.",
    );
  }
}

/** Pure half of the check, so the decision is tested without real users. */
export function socketDirProblem(
  dir: string,
  info: { uid: number; mode: number; isDirectory: boolean },
  uid: number,
): string | null {
  if (!info.isDirectory) return `${dir} is not a directory.`;
  if (info.uid !== uid) return `${dir} belongs to another user.`;
  if (info.mode & 0o077) {
    const mode = (info.mode & 0o777).toString(8).padStart(3, "0");
    return `${dir} is mode ${mode}; other users could reach the socket. Run \`chmod 700 ${dir}\`.`;
  }
  return null;
}

/**
 * Throw unless `dir` is a directory owned by this user and closed to everyone
 * else. With `create`, a missing directory is made first, owner-only.
 * Returns false when it does not exist and was not created.
 */
export async function checkSocketDir(dir: string, create: boolean): Promise<boolean> {
  if (create) await mkdir(dir, { recursive: true, mode: OWNER_ONLY_DIR });

  let info;
  try {
    info = await stat(dir);
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") return false;
    throw err;
  }

  const uid = process.getuid?.() ?? -1;
  const problem = socketDirProblem(
    dir,
    { uid: info.uid, mode: info.mode, isDirectory: info.isDirectory() },
    uid,
  );
  if (problem) throw new UnsafeSocketDirError(`Refusing to use the unlock agent: ${problem}`);
  return true;
}
