import { describe, expect, it } from "vitest";
import { decryptBlob, encryptBlob, importAesKey, randomBytes } from "./crypto.ts";
import {
  envKeyAtGen,
  generateKeyBytes,
  isPersonWrap,
  keysToRotate,
  nextEnvKey,
  nextWorkspaceKey,
  openEnvKeyAsAdmin,
  openFromPerson,
  planRotation,
  wrapToPerson,
  type KeyScope,
  type Member,
} from "./team-keys.ts";
import { generateUserKey, type UserKeypair } from "./user-key.ts";

async function person(userId: string): Promise<{ keypair: UserKeypair; member: Member }> {
  const { keypair } = await generateUserKey(await importAesKey(randomBytes(32)), userId);
  return { keypair, member: { userId, publicJwk: keypair.publicJwk, fingerprint: keypair.fingerprint } };
}

const dev: KeyScope = { kind: "env", workspaceId: "ws-1", projectId: "p-1", environment: "development" };

describe("wrapping a key to a person", () => {
  it("opens for the recipient, from the named sender", async () => {
    const alice = await person("alice");
    const bob = await person("bob");
    const key = generateKeyBytes();
    const wrap = await wrapToPerson(key, dev, 1, alice.keypair, bob.member);
    expect(isPersonWrap(wrap)).toBe(true);
    expect(wrap.sender).toBe(alice.keypair.fingerprint);
    expect(await openFromPerson(wrap, dev, 1, bob.keypair, alice.member)).toEqual(key);
  });

  it("works as a self-wrap, for the owner's first key", async () => {
    const alice = await person("alice");
    const key = generateKeyBytes();
    const wrap = await wrapToPerson(key, { kind: "workspace", workspaceId: "ws-1" }, 1, alice.keypair, alice.member);
    expect(await openFromPerson(wrap, { kind: "workspace", workspaceId: "ws-1" }, 1, alice.keypair, alice.member)).toEqual(key);
  });

  it("cannot be opened by anyone else, including the sender", async () => {
    const alice = await person("alice");
    const bob = await person("bob");
    const eve = await person("eve");
    const wrap = await wrapToPerson(generateKeyBytes(), dev, 1, alice.keypair, bob.member);
    await expect(openFromPerson(wrap, dev, 1, eve.keypair, alice.member)).rejects.toThrow();
    await expect(openFromPerson(wrap, dev, 1, alice.keypair, alice.member)).rejects.toThrow();
  });

  it("refuses a key minted by someone who is not the claimed sender (the server inventing a key)", async () => {
    const alice = await person("alice");
    const bob = await person("bob");
    const server = await person("server");
    // The server wraps a key of its own to Bob and labels it as Alice's.
    const forged = { ...(await wrapToPerson(generateKeyBytes(), dev, 1, server.keypair, bob.member)), sender: alice.keypair.fingerprint };
    await expect(openFromPerson(forged, dev, 1, bob.keypair, alice.member)).rejects.toThrow();
  });

  it("is bound to its scope and generation", async () => {
    const alice = await person("alice");
    const bob = await person("bob");
    const wrap = await wrapToPerson(generateKeyBytes(), dev, 2, alice.keypair, bob.member);
    const prod: KeyScope = { ...dev, environment: "production" };
    await expect(openFromPerson(wrap, prod, 2, bob.keypair, alice.member)).rejects.toThrow();
    await expect(openFromPerson(wrap, { ...dev, projectId: "p-2" }, 2, bob.keypair, alice.member)).rejects.toThrow();
    await expect(openFromPerson(wrap, { ...dev, workspaceId: "ws-2" }, 2, bob.keypair, alice.member)).rejects.toThrow();
    await expect(openFromPerson({ ...wrap, gen: 1 }, dev, 1, bob.keypair, alice.member)).rejects.toThrow();
    await expect(openFromPerson(wrap, { kind: "workspace", workspaceId: "ws-1" }, 2, bob.keypair, alice.member)).rejects.toThrow();
  });

  it("refuses a recipient or sender whose fingerprint does not match their key", async () => {
    const alice = await person("alice");
    const bob = await person("bob");
    const eve = await person("eve");
    await expect(
      wrapToPerson(generateKeyBytes(), dev, 1, alice.keypair, { ...bob.member, publicJwk: eve.member.publicJwk }),
    ).rejects.toThrow(/fingerprint/);
    const wrap = await wrapToPerson(generateKeyBytes(), dev, 1, alice.keypair, bob.member);
    await expect(
      openFromPerson(wrap, dev, 1, bob.keypair, { ...alice.member, publicJwk: eve.member.publicJwk }),
    ).rejects.toThrow(/fingerprint/);
  });
});

describe("environment keys", () => {
  it("encrypt blobs that admins and grantees both open, unchanged from crypto.ts", async () => {
    const owner = await person("owner");
    const dana = await person("dana");
    const ws = await nextWorkspaceKey({ workspaceId: "ws-1", sender: owner.keypair, admins: [owner.member] });
    const { generation, key } = await nextEnvKey({
      workspaceId: "ws-1",
      projectId: "p-1",
      environment: "development",
      workspace: ws,
      sender: owner.keypair,
      grantees: [dana.member],
    });
    expect(generation.gen).toBe(1);
    expect(generation.prevWrapped).toBeUndefined();

    const text = "# Database\nDATABASE_URL=postgres://x\n\nMULTI=\"a\nb\"\n";
    const blob = await encryptBlob(await importAesKey(key), text);

    // Dana, through her grant.
    const danaKey = await openFromPerson(generation.grants[0]!.wrap, dev, 1, dana.keypair, owner.member);
    expect(await decryptBlob(await importAesKey(danaKey), blob)).toBe(text);

    // The owner, through the workspace key.
    const ownerWs = await openFromPerson(ws.wraps[0]!.wrap, { kind: "workspace", workspaceId: "ws-1" }, 1, owner.keypair, owner.member);
    const ref = { workspaceId: "ws-1", projectId: "p-1", environment: "development", gen: 1, workspaceGen: 1 };
    const adminKey = await openEnvKeyAsAdmin(ownerWs, generation.adminWrapped, ref);
    expect(await decryptBlob(await importAesKey(adminKey), blob)).toBe(text);
    await expect(openEnvKeyAsAdmin(ownerWs, generation.adminWrapped, { ...ref, environment: "production" })).rejects.toThrow();
  });

  it("chain back so the current key reads every older version", async () => {
    const owner = await person("owner");
    const ws = { gen: 1, key: generateKeyBytes() };
    const base = { workspaceId: "ws-1", projectId: "p-1", environment: "", workspace: ws, sender: owner.keypair, grantees: [] };
    const g1 = await nextEnvKey(base);
    const g2 = await nextEnvKey({ ...base, previous: { gen: 1, key: g1.key } });
    const g3 = await nextEnvKey({ ...base, previous: { gen: 2, key: g2.key } });
    const links = { 2: g2.generation.prevWrapped, 3: g3.generation.prevWrapped };
    const scope = { projectId: "p-1", environment: "" };

    expect(await envKeyAtGen({ gen: 3, key: g3.key }, 1, links, scope)).toEqual(g1.key);
    expect(await envKeyAtGen({ gen: 3, key: g3.key }, 2, links, scope)).toEqual(g2.key);
    expect(await envKeyAtGen({ gen: 3, key: g3.key }, 3, links, scope)).toEqual(g3.key);
    await expect(envKeyAtGen({ gen: 3, key: g3.key }, 4, links, scope)).rejects.toThrow();
    await expect(envKeyAtGen({ gen: 3, key: g3.key }, 1, { 3: links[3] }, scope)).rejects.toThrow(/Missing/);
    await expect(envKeyAtGen({ gen: 3, key: g3.key }, 1, links, { ...scope, environment: "production" })).rejects.toThrow();
    // Links survive a move: they name the project, not the workspace.
    expect(g2.generation.prevWrapped).toBeDefined();
  });
});

describe("rotation", () => {
  it("picks exactly the keys someone could open", () => {
    const envKeys = [
      { projectId: "p-1", environment: "development" },
      { projectId: "p-1", environment: "production" },
      { projectId: "p-2", environment: "development" },
    ];
    expect(keysToRotate({ adminRemoved: false, envKeys, lostGrants: [envKeys[1]!] })).toEqual({
      workspace: false,
      envKeys: [envKeys[1]],
    });
    expect(keysToRotate({ adminRemoved: true, envKeys, lostGrants: [] })).toEqual({ workspace: true, envKeys });
    expect(keysToRotate({ adminRemoved: false, envKeys, lostGrants: [] }).envKeys).toEqual([]);
  });

  it("leaves a removed member unable to open the new generation, while the rest keep reading history", async () => {
    const owner = await person("owner");
    const admin = await person("admin");
    const dana = await person("dana");
    const leaver = await person("leaver");
    const ws = await nextWorkspaceKey({ workspaceId: "ws-1", sender: owner.keypair, admins: [owner.member, admin.member] });
    const g1 = await nextEnvKey({
      workspaceId: "ws-1",
      projectId: "p-1",
      environment: "development",
      workspace: ws,
      sender: owner.keypair,
      grantees: [dana.member, leaver.member],
    });
    const oldBlob = await encryptBlob(await importAesKey(g1.key), "OLD=1\n");

    // The admin leaves too, so the workspace key rotates as well.
    const { plan, envKeys } = await planRotation({
      workspaceId: "ws-1",
      sender: owner.keypair,
      workspace: ws,
      rotateWorkspace: true,
      admins: [owner.member],
      envKeys: [{ projectId: "p-1", environment: "development", gen: 1, key: g1.key, grantees: [dana.member] }],
    });
    expect(plan.workspace?.gen).toBe(2);
    expect(plan.workspace?.wraps.map((w) => w.userId)).toEqual(["owner"]);
    const gen2 = plan.envKeys[0]!;
    expect(gen2.gen).toBe(2);
    expect(gen2.workspaceGen).toBe(2);
    expect(gen2.grants.map((g) => g.userId)).toEqual(["dana"]);
    const newKey = envKeys.get("p-1\ndevelopment")!;
    expect(newKey.key).not.toEqual(g1.key);

    // Dana opens generation 2 and walks back to read the old version.
    const danaGen2 = await openFromPerson(gen2.grants[0]!.wrap, dev, 2, dana.keypair, owner.member);
    const danaGen1 = await envKeyAtGen({ gen: 2, key: danaGen2 }, 1, { 2: gen2.prevWrapped }, { projectId: "p-1", environment: "development" });
    expect(await decryptBlob(await importAesKey(danaGen1), oldBlob)).toBe("OLD=1\n");

    // Nobody wrapped generation 2 to the leaver or the departed admin.
    for (const gone of [leaver, admin]) {
      for (const grant of gen2.grants) await expect(openFromPerson(grant.wrap, dev, 2, gone.keypair, owner.member)).rejects.toThrow();
      for (const w of plan.workspace!.wraps) {
        await expect(openFromPerson(w.wrap, { kind: "workspace", workspaceId: "ws-1" }, 2, gone.keypair, owner.member)).rejects.toThrow();
      }
    }
  });
});
