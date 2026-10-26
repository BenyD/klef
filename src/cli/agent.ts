// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The unlock agent: a background process that holds the DEK in memory so one
// passphrase covers a run of pulls and pushes. docs/AGENT_ACCESS.md §6.
//
// What it is careful about:
//
// - The key lives in this process's memory only, as a non-extractable
//   CryptoKey. It is never written to disk, the keychain, or the socket.
// - The socket exposes operations (encrypt this, decrypt that), never the key,
//   and sits in an owner-only directory with mode 0600 (see socket-dir.ts).
// - It forgets the key after AUTO_LOCK_DEFAULT_MINUTES without a key
//   operation, the same default the web vault uses (`klef unlock --for`
//   chooses another, up to MAX_LOCK_MINUTES), and on `klef lock`.
// - It prints nothing. It runs detached with no terminal, and has nothing to
//   say that would not be a value.

import { createServer, connect, type Server, type Socket } from "node:net";
import { chmod, unlink } from "node:fs/promises";
import path from "node:path";
import { decryptBlob, encryptBlob, unlockWithKekBytes } from "../shared/crypto.ts";
import { base64ToBytes } from "../shared/encoding.ts";
import type { WrappedKey } from "../shared/types.ts";
import {
  encodeFrame,
  MAX_FRAME_BYTES,
  parseRequest,
  ProtocolError,
  type AgentRequest,
  type AgentResponse,
} from "./agent-protocol.ts";
import { assertSocketPathFits, checkSocketDir } from "./socket-dir.ts";

export class AgentRunningError extends Error {
  constructor() {
    super("An unlock agent is already running.");
  }
}

export interface AgentOptions {
  dek: CryptoKey;
  fingerprint: string;
  socketPath: string;
  idleMs: number;
  /** Injectable clock, for the expiry tests. */
  now?: () => number;
}

export interface RunningAgent {
  /** Forget the key, close the socket, remove it. Idempotent. */
  lock: () => Promise<void>;
  /** Resolves once the agent has locked, for whatever reason. */
  locked: Promise<void>;
}

/** True when something is accepting connections on `socketPath`. */
function isListening(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = connect(socketPath);
    probe.on("connect", () => {
      probe.destroy();
      resolve(true);
    });
    probe.on("error", () => resolve(false));
  });
}

export async function startAgent(options: AgentOptions): Promise<RunningAgent> {
  const { fingerprint, socketPath, idleMs } = options;
  const now = options.now ?? Date.now;
  assertSocketPathFits(socketPath);
  await checkSocketDir(path.dirname(socketPath), true);

  // A socket file with nobody behind it is what a crashed agent or a reboot
  // leaves. A live one means someone already unlocked; never steal it.
  if (await isListening(socketPath)) throw new AgentRunningError();
  await unlink(socketPath).catch(() => {});

  let dek: CryptoKey | null = options.dek;
  let lastUse = now();
  let timer: NodeJS.Timeout | undefined;
  let resolveLocked!: () => void;
  const locked = new Promise<void>((resolve) => {
    resolveLocked = resolve;
  });

  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    handle(socket);
  });

  const lock = async () => {
    if (dek === null) return;
    // Drop the only reference first, so nothing that is still in flight can
    // reach the key after this point.
    dek = null;
    clearTimeout(timer);
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    // A client that connected and never finished its request would otherwise
    // hold the server open past its own deadline.
    for (const socket of sockets) socket.destroy();
    await closed;
    await unlink(socketPath).catch(() => {});
    resolveLocked();
  };

  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void lock(), Math.max(0, lastUse + idleMs - now()));
  };

  async function respond(req: AgentRequest): Promise<AgentResponse> {
    const key = dek;
    if (key === null) return { ok: false, error: "locked" };

    switch (req.op) {
      case "status":
        // Asking is not using: a status poll must not keep the vault open.
        return {
          ok: true,
          status: {
            fingerprint,
            msLeft: Math.max(0, lastUse + idleMs - now()),
            idleMinutes: Math.round(idleMs / 60_000),
          },
        };
      case "encrypt":
        lastUse = now();
        arm();
        return { ok: true, blob: await encryptBlob(key, req.plaintext) };
      case "decrypt":
        lastUse = now();
        arm();
        try {
          return { ok: true, plaintext: await decryptBlob(key, req.blob) };
        } catch {
          return { ok: false, error: "That blob does not decrypt with this vault's key." };
        }
      case "lock":
        return { ok: true };
    }
  }

  function handle(socket: Socket): void {
    let buffer = "";
    let handled = false;
    socket.setEncoding("utf8");
    socket.on("error", () => socket.destroy());
    socket.on("data", (chunk: string) => {
      if (handled) return;
      buffer += chunk;
      if (buffer.length > MAX_FRAME_BYTES) {
        socket.destroy();
        return;
      }
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      handled = true;

      let req: AgentRequest;
      try {
        req = parseRequest(buffer.slice(0, newline));
      } catch (err) {
        const error = err instanceof ProtocolError ? err.message : "Bad request.";
        socket.end(encodeFrame({ ok: false, error }));
        return;
      }

      void respond(req)
        .catch((): AgentResponse => ({ ok: false, error: "The operation failed." }))
        .then((res) => {
          socket.end(encodeFrame(res), () => {
            if (req.op === "lock") void lock();
          });
        });
    });
  }

  // Created owner-only from the first instant rather than chmod-ed after, so
  // there is no window where the socket exists with looser permissions. The
  // chmod afterwards is for platforms where umask does not apply to sockets.
  const previousMask = process.umask(0o177);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, () => resolve());
    });
  } finally {
    process.umask(previousMask);
  }
  await chmod(socketPath, 0o600);

  arm();
  return { lock, locked };
}

/** What `klef unlock` sends its agent over the IPC channel, once. */
export interface AgentHandoff {
  kek: string;
  wrappedDek: WrappedKey;
  fingerprint: string;
  socketPath: string;
  idleMs: number;
}

/** The child's first message: listening, send the handoff. */
export interface AgentReady {
  ready: true;
}

export type AgentHandoffReply = { ok: true } | { ok: false; error: "passphrase" | string };

/**
 * Entry point of the detached agent process (`klef __agent`, which `klef
 * unlock` spawns; not meant to be run by hand). It takes the KEK over the IPC
 * channel its parent opened, never from argv or the environment, unwraps the
 * DEK, starts listening, reports back, and cuts the channel.
 */
export async function runAgentProcess(): Promise<number> {
  const send = process.send?.bind(process);
  if (!send) {
    console.error("This is started by `klef unlock`, not run directly.");
    return 1;
  }

  // Listen first, then say so: a message that arrives before anyone listens
  // for it is dropped, so the parent waits for "ready" before sending the KEK.
  const handoff = await new Promise<AgentHandoff>((resolve) => {
    process.once("message", (message) => resolve(message as AgentHandoff));
    send({ ready: true } satisfies AgentReady);
  });

  const reply = (message: AgentHandoffReply) =>
    new Promise<void>((resolve) => send(message, () => resolve()));

  let dek: CryptoKey;
  try {
    const kekBytes = base64ToBytes(handoff.kek);
    dek = await unlockWithKekBytes(kekBytes, handoff.wrappedDek);
    kekBytes.fill(0);
  } catch {
    await reply({ ok: false, error: "passphrase" });
    return 1;
  }

  let agent: RunningAgent;
  try {
    agent = await startAgent({
      dek,
      fingerprint: handoff.fingerprint,
      socketPath: handoff.socketPath,
      idleMs: handoff.idleMs,
    });
  } catch (err) {
    await reply({ ok: false, error: err instanceof Error ? err.message : String(err) });
    return 1;
  }

  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
    process.on(signal, () => void agent.lock());
  }

  await reply({ ok: true });
  process.disconnect?.();
  await agent.locked;
  return 0;
}
