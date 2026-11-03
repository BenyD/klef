import { describe, expect, it } from "vitest";
import {
  encryptBlob,
  generateUserKey,
  importAesKey,
  nextEnvKey,
  nextWorkspaceKey,
  openUserKey,
  randomBytes,
  sealPins,
  type UserKeyRecord,
  type WorkspaceKeysResponse,
} from "../shared/core.ts";
import { teamOps, type TeamKeyRequest } from "./team-cipher.ts";

const WS = "ws-1";
const PROJECT = "p-1";
const newDek = () => importAesKey(randomBytes(32));

// Alice runs the team; Bob, whose DEK this CLI holds, is granted
// development. `role` is what the server says Alice is in the team now.
async function team(role: "owner" | "admin" | "member" | null = "owner") {
  const alice = await generateUserKey(await newDek(), "alice");
  const dek = await newDek();
  const bob = await generateUserKey(dek, "bob");
  const bobMember = { userId: "bob", publicJwk: bob.keypair.publicJwk, fingerprint: bob.keypair.fingerprint };
  const aliceMember = { userId: "alice", publicJwk: alice.keypair.publicJwk, fingerprint: alice.keypair.fingerprint };
  const ws = await nextWorkspaceKey({ workspaceId: WS, sender: alice.keypair, admins: [aliceMember] });
  const g1 = await nextEnvKey({
    workspaceId: WS,
    projectId: PROJECT,
    environment: "development",
    workspace: { gen: ws.gen, key: ws.key },
    sender: alice.keypair,
    grantees: [bobMember],
  });
  const fp = alice.keypair.fingerprint;
  const keys: WorkspaceKeysResponse = {
    workspace: null,
    envKeys: [
      {
        id: "ek-dev",
        projectId: PROJECT,
        environment: "development",
        gen: 1,
        gens: [{ gen: 1, workspaceGen: 1, adminWrapped: null, prevWrapped: null }],
        grant: { access: "write", keyGen: 1, wrap: g1.generation.grants[0]!.wrap },
      },
    ],
    senders: { [fp]: alice.keypair.publicJwk },
    senderInfo: { [fp]: { userId: "alice", role } },
  };
  const req: TeamKeyRequest = { userId: "bob", userKey: bob.record, workspaceId: WS, keys };
  const blob = await encryptBlob(await importAesKey(g1.key), "TOKEN=abc\n");
  return { dek, alice, req, blob, fp };
}

describe("team operations over a held DEK", () => {
  it("decrypts a team version granted to this account", async () => {
    const t = await team();
    const ops = teamOps(t.dek);
    expect(await ops.teamDecrypt({ ...t.req, blob: t.blob, keyScope: "ek-dev", keyGen: 1 })).toBe("TOKEN=abc\n");
  });

  it("encrypts a team file that then decrypts", async () => {
    const t = await team();
    const ops = teamOps(t.dek);
    const out = await ops.teamEncrypt({ ...t.req, projectId: PROJECT, environment: "development", plaintext: "A=1\n" });
    expect(out.keyGen).toBe(1);
    expect(await ops.teamDecrypt({ ...t.req, blob: out.blob, keyScope: "ek-dev", keyGen: 1 })).toBe("A=1\n");
  });

  it("trusts an admin's wraps", async () => {
    const t = await team("admin");
    expect(await teamOps(t.dek).teamDecrypt({ ...t.req, blob: t.blob, keyScope: "ek-dev", keyGen: 1 })).toBe("TOKEN=abc\n");
  });

  it("refuses wraps from someone who is not an admin, unless pinned before", async () => {
    const t = await team("member");
    const ops = teamOps(t.dek);
    const decrypt = (pins: TeamKeyRequest["pins"]) => ops.teamDecrypt({ ...t.req, pins, blob: t.blob, keyScope: "ek-dev", keyGen: 1 });
    await expect(decrypt(null)).rejects.toThrow("given out by someone who is not a team admin");
    const pins = await sealPins(t.dek, "bob", { alice: t.fp });
    expect(await decrypt(pins)).toBe("TOKEN=abc\n");
  });

  it("keeps opening wraps from an admin who has left, when pinned", async () => {
    const t = await team(null);
    const pins = await sealPins(t.dek, "bob", { alice: t.fp });
    expect(await teamOps(t.dek).teamDecrypt({ ...t.req, pins, blob: t.blob, keyScope: "ek-dev", keyGen: 1 })).toBe("TOKEN=abc\n");
  });

  it("refuses a sender whose key changed since it was pinned", async () => {
    const t = await team("owner");
    const pins = await sealPins(t.dek, "bob", { alice: "an-older-fingerprint" });
    await expect(
      teamOps(t.dek).teamDecrypt({ ...t.req, pins, blob: t.blob, keyScope: "ek-dev", keyGen: 1 }),
    ).rejects.toThrow("does not match the one this account saw before");
  });

  it("refuses a sender the server does not identify", async () => {
    const t = await team();
    const keys = { ...t.req.keys, senderInfo: {} };
    await expect(
      teamOps(t.dek).teamDecrypt({ ...t.req, keys, blob: t.blob, keyScope: "ek-dev", keyGen: 1 }),
    ).rejects.toThrow("made by someone Klef cannot identify");
  });

  it("reads pins it cannot open as no pins", async () => {
    const t = await team("owner");
    // Sealed for another account, so it does not open under Bob's context.
    const pins = await sealPins(t.dek, "someone-else", { alice: "an-older-fingerprint" });
    expect(await teamOps(t.dek).teamDecrypt({ ...t.req, pins, blob: t.blob, keyScope: "ek-dev", keyGen: 1 })).toBe("TOKEN=abc\n");
  });

  it("fails under another account's DEK", async () => {
    const t = await team();
    await expect(teamOps(await newDek()).teamDecrypt({ ...t.req, blob: t.blob, keyScope: "ek-dev", keyGen: 1 })).rejects.toThrow();
  });

  it("makes a sharing key sealed under the DEK", async () => {
    const dek = await newDek();
    const record: UserKeyRecord = await teamOps(dek).newUserKey("bob");
    expect(JSON.stringify(record)).not.toContain('"d"');
    const opened = await openUserKey(dek, "bob", record);
    expect(opened.fingerprint).toBe(record.fingerprint);
    await expect(openUserKey(await newDek(), "bob", record)).rejects.toThrow();
  });
});
