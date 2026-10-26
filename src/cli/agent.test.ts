import { connect } from "node:net";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { decryptBlob, encryptBlob, setupVault, type VaultSetupResult } from "../shared/crypto.ts";
import { agentRequest, agentStatus, lockAgent } from "./agent-client.ts";
import { vaultFingerprint } from "./agent-protocol.ts";
import { AgentRunningError, startAgent, type RunningAgent } from "./agent.ts";
import { openVault } from "./vault-key.ts";

const PASSPHRASE = "correct horse battery staple";
const TEXT = "# Heading\nDATABASE_URL=postgres://localhost/app\nEMPTY=\n";
const MINUTE = 60_000;

let vault: VaultSetupResult;
let fingerprint: string;
let dir: string;
let socketPath: string;
let agent: RunningAgent | null;

beforeAll(async () => {
  vault = await setupVault(PASSPHRASE);
  fingerprint = await vaultFingerprint(vault.keyMaterial.wrappedDek);
});

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "klef-agent-"));
  socketPath = path.join(dir, "run", "agent.sock");
  agent = null;
});

afterEach(async () => {
  await agent?.lock();
  await rm(dir, { recursive: true, force: true });
});

function start(options: { idleMs?: number; now?: () => number } = {}) {
  return startAgent({
    dek: vault.dek,
    fingerprint,
    socketPath,
    idleMs: options.idleMs ?? 15 * MINUTE,
    now: options.now,
  }).then((running) => (agent = running));
}

/** Send a raw line, the way something other than the CLI might. */
function raw(line: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    let data = "";
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(line));
    socket.on("data", (chunk: string) => (data += chunk));
    socket.on("end", () => resolve(data));
    socket.on("error", reject);
  });
}

describe("unlock agent", () => {
  it("encrypts and decrypts byte-for-byte with the vault's key", async () => {
    await start();

    const sealed = await agentRequest(socketPath, { op: "encrypt", plaintext: TEXT });
    expect(sealed?.ok && "blob" in sealed).toBe(true);
    if (!sealed?.ok || !("blob" in sealed)) return;
    expect(await decryptBlob(vault.dek, sealed.blob)).toBe(TEXT);

    const opened = await agentRequest(socketPath, {
      op: "decrypt",
      blob: await encryptBlob(vault.dek, TEXT),
    });
    expect(opened).toEqual({ ok: true, plaintext: TEXT });
  });

  it("creates its socket owner-only, in an owner-only directory", async () => {
    await start();
    expect((await stat(socketPath)).mode & 0o777).toBe(0o600);
    expect((await stat(path.dirname(socketPath))).mode & 0o777).toBe(0o700);
  });

  it("reports which vault it holds and the time left", async () => {
    await start();
    const status = await agentStatus(socketPath);
    expect(status?.fingerprint).toBe(fingerprint);
    expect(status?.idleMinutes).toBe(15);
    expect(status?.msLeft).toBeGreaterThan(14 * MINUTE);
    expect(status?.msLeft).toBeLessThanOrEqual(15 * MINUTE);
  });

  it("counts encrypt and decrypt as use, and status as not", async () => {
    let clock = 1_000_000;
    await start({ now: () => clock });

    clock += 10 * MINUTE;
    expect((await agentStatus(socketPath))?.msLeft).toBe(5 * MINUTE);

    await agentRequest(socketPath, { op: "encrypt", plaintext: TEXT });
    expect((await agentStatus(socketPath))?.msLeft).toBe(15 * MINUTE);
  });

  it("forgets the key and removes its socket after the idle timeout", async () => {
    const running = await start({ idleMs: 50 });
    await running.locked;
    expect(await agentStatus(socketPath)).toBeNull();
    await expect(stat(socketPath)).rejects.toThrow();
  });

  it("locks on request, after which it is gone", async () => {
    const running = await start();
    expect(await lockAgent(socketPath)).toBe(true);
    await running.locked;
    expect(await agentStatus(socketPath)).toBeNull();
    expect(await lockAgent(socketPath)).toBe(false);
  });

  it("refuses to take over a socket another agent is serving", async () => {
    await start();
    await expect(
      startAgent({ dek: vault.dek, fingerprint, socketPath, idleMs: MINUTE }),
    ).rejects.toThrow(AgentRunningError);
  });

  it("replaces a stale socket file left by an agent that is gone", async () => {
    await start();
    await agent!.lock();
    await writeFile(socketPath, "");
    await start();
    expect(await agentStatus(socketPath)).not.toBeNull();
  });

  it("answers unknown or malformed requests with an error and nothing else", async () => {
    await start();
    for (const line of ['{"op":"export"}\n', '{"op":"key"}\n', "not json\n"]) {
      const reply = JSON.parse(await raw(line));
      expect(reply.ok).toBe(false);
      expect(Object.keys(reply).sort()).toEqual(["error", "ok"]);
    }
  });

  it("refuses a blob from another vault without saying more", async () => {
    await start();
    const other = await setupVault("a different passphrase");
    const res = await agentRequest(socketPath, {
      op: "decrypt",
      blob: await encryptBlob(other.dek, TEXT),
    });
    expect(res?.ok).toBe(false);
  });

  it("is simply absent when nothing has been unlocked", async () => {
    expect(await agentStatus(socketPath)).toBeNull();
    expect(await lockAgent(socketPath)).toBe(false);
  });
});

describe("openVault", () => {
  const never = () => Promise.reject(new Error("prompted"));
  const env = () => ({ KLEF_AGENT_SOCK: socketPath });

  it("uses the agent, without prompting, when it holds this vault's key", async () => {
    await start();
    const cipher = await openVault(vault.keyMaterial, env(), never);
    expect(cipher.source).toBe("agent");
    expect(await cipher.decrypt(await cipher.encrypt(TEXT))).toBe(TEXT);
  });

  it("prompts when no agent is running", async () => {
    let asked = 0;
    const cipher = await openVault(vault.keyMaterial, env(), () => {
      asked++;
      return Promise.resolve(PASSPHRASE);
    });
    expect(asked).toBe(1);
    expect(cipher.source).toBe("passphrase");
    expect(await cipher.decrypt(await cipher.encrypt(TEXT))).toBe(TEXT);
  });

  it("passes over an agent holding a different vault's key", async () => {
    await start();
    const other = await setupVault("a different passphrase");
    const cipher = await openVault(other.keyMaterial, env(), () =>
      Promise.resolve("a different passphrase"),
    );
    expect(cipher.source).toBe("passphrase");
  });

  it("says so plainly if the agent locks partway through a command", async () => {
    await start();
    const cipher = await openVault(vault.keyMaterial, env(), never);
    await agent!.lock();
    await expect(cipher.encrypt(TEXT)).rejects.toThrow(/locked while this was running/);
  });
});
