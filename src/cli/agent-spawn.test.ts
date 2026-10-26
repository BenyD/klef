import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deriveKekBytes, encryptBlob, setupVault } from "../shared/crypto.ts";
import { bytesToBase64 } from "../shared/encoding.ts";
import { agentRequest, agentStatus, lockAgent } from "./agent-client.ts";
import { vaultFingerprint } from "./agent-protocol.ts";
import { spawnAgent } from "./agent-spawn.ts";
import { WrongPassphraseError } from "./unlock.ts";

// The real thing: `node src/cli/index.ts __agent`, detached, handed the KEK
// over IPC. Everything else about the agent is tested in-process; this checks
// the handshake and that the child really does outlive the call.
const ENTRY = path.resolve(import.meta.dirname, "index.ts");
const PASSPHRASE = "correct horse battery staple";

let dir: string;
let socketPath: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "klef-spawn-"));
  socketPath = path.join(dir, "run", "agent.sock");
});

afterEach(async () => {
  await lockAgent(socketPath).catch(() => false);
  await rm(dir, { recursive: true, force: true });
});

describe("spawnAgent", () => {
  it("starts a detached agent that serves the vault's key", async () => {
    const vault = await setupVault(PASSPHRASE);
    const kek = bytesToBase64(await deriveKekBytes(PASSPHRASE, vault.keyMaterial.kdfParams));
    const fingerprint = await vaultFingerprint(vault.keyMaterial.wrappedDek);

    await spawnAgent(
      { kek, wrappedDek: vault.keyMaterial.wrappedDek, fingerprint, socketPath, idleMs: 60_000 },
      ENTRY,
    );

    expect((await agentStatus(socketPath))?.fingerprint).toBe(fingerprint);
    const text = "A=1\n";
    const res = await agentRequest(socketPath, {
      op: "decrypt",
      blob: await encryptBlob(vault.dek, text),
    });
    expect(res).toEqual({ ok: true, plaintext: text });

    expect(await lockAgent(socketPath)).toBe(true);
  }, 20_000);

  it("reports a wrong passphrase and leaves nothing running", async () => {
    const vault = await setupVault(PASSPHRASE);
    const kek = bytesToBase64(await deriveKekBytes("wrong", vault.keyMaterial.kdfParams));

    await expect(
      spawnAgent(
        { kek, wrappedDek: vault.keyMaterial.wrappedDek, fingerprint: "x", socketPath, idleMs: 60_000 },
        ENTRY,
      ),
    ).rejects.toThrow(WrongPassphraseError);
    expect(await agentStatus(socketPath)).toBeNull();
  }, 20_000);
});
