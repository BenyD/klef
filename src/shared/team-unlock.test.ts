import { describe, expect, it } from "vitest";
import type { EnvKeyInfo, WorkspaceKeysResponse } from "./api-types.ts";
import { decryptBlob, encryptBlob, importAesKey, randomBytes } from "./crypto.ts";
import { nextEnvKey, nextWorkspaceKey, wrapToPerson, type Member } from "./team-keys.ts";
import { decryptTeamBlob, encryptTeamText, envKeyAt, envKeyFor, NoTeamKeyError, openTeamKeys } from "./team-unlock.ts";
import { generateUserKey, type UserKeypair } from "./user-key.ts";

async function person(userId: string): Promise<{ keypair: UserKeypair; member: Member }> {
  const { keypair } = await generateUserKey(await importAesKey(randomBytes(32)), userId);
  return { keypair, member: { userId, publicJwk: keypair.publicJwk, fingerprint: keypair.fingerprint } };
}

const WS = "ws-1";
const PROJECT = "p-1";

// A team as the server would hold it: Alice owns it, Bob is granted the
// development environment, which has been rotated once (generation 2). A
// version encrypted under each generation, and the keys response each of them
// is served.
async function team() {
  const alice = await person("alice");
  const bob = await person("bob");
  const ws = await nextWorkspaceKey({ workspaceId: WS, sender: alice.keypair, admins: [alice.member] });
  const workspace = { gen: ws.gen, key: ws.key };
  const base = { workspaceId: WS, projectId: PROJECT, environment: "development", workspace, sender: alice.keypair, grantees: [bob.member] };
  const g1 = await nextEnvKey(base);
  const g2 = await nextEnvKey({ ...base, previous: { gen: 1, key: g1.key } });

  const v1 = await encryptBlob(await importAesKey(g1.key), "API_KEY=one\n");
  const v2 = await encryptBlob(await importAesKey(g2.key), "API_KEY=two\n");

  const gens = (admin: boolean): EnvKeyInfo["gens"] =>
    [g1.generation, g2.generation].map((g) => ({
      gen: g.gen,
      workspaceGen: g.workspaceGen,
      adminWrapped: admin ? g.adminWrapped : null,
      prevWrapped: g.prevWrapped ?? null,
    }));
  const senders = { [alice.keypair.fingerprint]: alice.keypair.publicJwk };
  const senderInfo = { [alice.keypair.fingerprint]: { userId: "alice", role: "owner" as const } };

  const forAlice: WorkspaceKeysResponse = {
    workspace: { gen: ws.gen, wrap: ws.wraps[0]!.wrap },
    envKeys: [{ id: "ek-dev", projectId: PROJECT, environment: "development", gen: 2, gens: gens(true) }],
    senders,
    senderInfo,
  };
  const forBob: WorkspaceKeysResponse = {
    workspace: null,
    envKeys: [
      {
        id: "ek-dev",
        projectId: PROJECT,
        environment: "development",
        gen: 2,
        gens: gens(false),
        grant: { access: "read", keyGen: 2, wrap: g2.generation.grants[0]!.wrap },
      },
    ],
    senders,
    senderInfo,
  };
  return { alice, bob, ws, g1, g2, v1, v2, forAlice, forBob };
}

describe("opening a team's keys", () => {
  it("opens the workspace key and every environment for an owner", async () => {
    const t = await team();
    const opened = await openTeamKeys(t.alice.keypair, WS, t.forAlice);
    expect(opened.workspaceId).toBe(WS);
    expect(opened.workspace).toEqual({ gen: 1, key: t.ws.key });
    expect(opened.envKeys.get("ek-dev")?.current).toEqual(t.g2.key);
    expect(await decryptTeamBlob(opened, t.v2, "ek-dev", 2)).toBe("API_KEY=two\n");
    expect(await decryptTeamBlob(opened, t.v1, "ek-dev", 1)).toBe("API_KEY=one\n");
  });

  it("opens a member's grant, and walks the chain back to older versions", async () => {
    const t = await team();
    const opened = await openTeamKeys(t.bob.keypair, WS, t.forBob);
    expect(opened.workspace).toBeNull();
    expect(opened.envKeys.get("ek-dev")?.current).toEqual(t.g2.key);
    expect(await decryptTeamBlob(opened, t.v2, "ek-dev", 2)).toBe("API_KEY=two\n");
    expect(await decryptTeamBlob(opened, t.v1, "ek-dev", 1)).toBe("API_KEY=one\n");
  });

  it("leaves the current key intact after reading an older generation", async () => {
    const t = await team();
    const opened = await openTeamKeys(t.bob.keypair, WS, t.forBob);
    await decryptTeamBlob(opened, t.v1, "ek-dev", 1);
    await decryptTeamBlob(opened, t.v2, "ek-dev", 2);
    expect(opened.envKeys.get("ek-dev")?.current).toEqual(t.g2.key);
  });

  it("does not open a grant left behind by a rotation", async () => {
    const t = await team();
    const stale = structuredClone(t.forBob);
    stale.envKeys[0]!.grant = { access: "read", keyGen: 1, wrap: t.g1.generation.grants[0]!.wrap };
    const opened = await openTeamKeys(t.bob.keypair, WS, stale);
    expect(opened.envKeys.get("ek-dev")?.current).toBeNull();
    await expect(decryptTeamBlob(opened, t.v1, "ek-dev", 1)).rejects.toThrow(NoTeamKeyError);
  });

  it("skips wraps meant for someone else, without failing the rest", async () => {
    const t = await team();
    const eve = await person("eve");
    const asEve = await openTeamKeys(eve.keypair, WS, t.forAlice);
    expect(asEve.workspace).toBeNull();
    expect(asEve.envKeys.get("ek-dev")?.current).toBeNull();
    const eveGrant = await openTeamKeys(eve.keypair, WS, t.forBob);
    expect(eveGrant.envKeys.get("ek-dev")?.current).toBeNull();
  });

  it("does not open a grant the server moved onto another environment", async () => {
    const t = await team();
    const moved = structuredClone(t.forBob);
    moved.envKeys[0]!.environment = "production";
    const opened = await openTeamKeys(t.bob.keypair, WS, moved);
    expect(opened.envKeys.get("ek-dev")?.current).toBeNull();
  });

  it("does not open a grant served for another workspace", async () => {
    const t = await team();
    const opened = await openTeamKeys(t.bob.keypair, "ws-2", t.forBob);
    expect(opened.envKeys.get("ek-dev")?.current).toBeNull();
  });

  it("does not open an admin copy made under another workspace key generation", async () => {
    const t = await team();
    const skewed = structuredClone(t.forAlice);
    for (const g of skewed.envKeys[0]!.gens) g.workspaceGen = 2;
    const opened = await openTeamKeys(t.alice.keypair, WS, skewed);
    expect(opened.workspace).not.toBeNull();
    expect(opened.envKeys.get("ek-dev")?.current).toBeNull();
  });

  it("refuses a key the server minted and labelled as the owner's", async () => {
    const t = await team();
    const server = await person("server");
    const forged = structuredClone(t.forBob);
    const scope = { kind: "env" as const, workspaceId: WS, projectId: PROJECT, environment: "development" };
    const wrap = await wrapToPerson(randomBytes(32), scope, 2, server.keypair, t.bob.member);
    forged.envKeys[0]!.grant!.wrap = { ...wrap, sender: t.alice.keypair.fingerprint };
    const opened = await openTeamKeys(t.bob.keypair, WS, forged);
    expect(opened.envKeys.get("ek-dev")?.current).toBeNull();
  });

  it("asks the trust check about each sender, and stops when it refuses", async () => {
    const t = await team();
    const asked: string[] = [];
    await openTeamKeys(t.bob.keypair, WS, t.forBob, { trust: (fp) => void asked.push(fp) });
    expect(asked).toEqual([t.alice.keypair.fingerprint]);

    const refuse = () => {
      throw new NoTeamKeyError("not trusted");
    };
    await expect(openTeamKeys(t.bob.keypair, WS, t.forBob, { trust: refuse })).rejects.toThrow("not trusted");
    await expect(openTeamKeys(t.alice.keypair, WS, t.forAlice, { trust: refuse })).rejects.toThrow("not trusted");
  });

  it("stops when a wrap's sender has no public key in the response", async () => {
    const t = await team();
    await expect(openTeamKeys(t.bob.keypair, WS, { ...t.forBob, senders: {} })).rejects.toThrow(/whose key is missing/);
  });

  it("refuses a sender whose served public key does not match their fingerprint", async () => {
    const t = await team();
    const eve = await person("eve");
    const swapped = { ...t.forBob, senders: { [t.alice.keypair.fingerprint]: eve.keypair.publicJwk } };
    const opened = await openTeamKeys(t.bob.keypair, WS, swapped);
    expect(opened.envKeys.get("ek-dev")?.current).toBeNull();
  });

  it("opens an environment with no gens or grant as one this person cannot read", async () => {
    const t = await team();
    const keys: WorkspaceKeysResponse = {
      ...t.forBob,
      envKeys: [...t.forBob.envKeys, { id: "ek-prod", projectId: PROJECT, environment: "production", gen: 1, gens: [] }],
    };
    const opened = await openTeamKeys(t.bob.keypair, WS, keys);
    expect(opened.envKeys.get("ek-prod")).toMatchObject({ environment: "production", gen: 1, current: null, links: {} });
  });
});

describe("environment keys", () => {
  it("finds a key by project and environment label", async () => {
    const t = await team();
    const opened = await openTeamKeys(t.bob.keypair, WS, t.forBob);
    expect(envKeyFor(opened, PROJECT, "development")?.id).toBe("ek-dev");
    expect(envKeyFor(opened, PROJECT, "production")).toBeUndefined();
    expect(envKeyFor(opened, "p-2", "development")).toBeUndefined();
  });

  it("refuses a generation outside the chain", async () => {
    const t = await team();
    const state = (await openTeamKeys(t.bob.keypair, WS, t.forBob)).envKeys.get("ek-dev")!;
    await expect(envKeyAt(state, 3)).rejects.toThrow(/No generation 3/);
    await expect(envKeyAt(state, 0)).rejects.toThrow(/No generation 0/);
  });

  it("fails on a missing chain link", async () => {
    const t = await team();
    const state = (await openTeamKeys(t.bob.keypair, WS, t.forBob)).envKeys.get("ek-dev")!;
    await expect(envKeyAt({ ...state, links: {} }, 1)).rejects.toThrow(/Missing key chain link/);
  });

  it("hands out a key that cannot be exported", async () => {
    const t = await team();
    const state = (await openTeamKeys(t.bob.keypair, WS, t.forBob)).envKeys.get("ek-dev")!;
    const key = await envKeyAt(state, 2);
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });

  it("refuses a version whose key scope this person has no entry for", async () => {
    const t = await team();
    const opened = await openTeamKeys(t.bob.keypair, WS, t.forBob);
    await expect(decryptTeamBlob(opened, t.v2, "ek-other", 2)).rejects.toThrow(NoTeamKeyError);
  });
});

describe("encrypting a team file", () => {
  it("encrypts under the current generation, readable by the rest of the team", async () => {
    const t = await team();
    const asBob = await openTeamKeys(t.bob.keypair, WS, t.forBob);
    const text = "# Database\nDATABASE_URL=postgres://x\n";
    const { blob, keyGen } = await encryptTeamText(asBob, PROJECT, "development", text);
    expect(keyGen).toBe(2);
    expect(await decryptBlob(await importAesKey(t.g2.key), blob)).toBe(text);
    const asAlice = await openTeamKeys(t.alice.keypair, WS, t.forAlice);
    expect(await decryptTeamBlob(asAlice, blob, "ek-dev", keyGen)).toBe(text);
  });

  it("says to save the first file in the web app when an environment has no key", async () => {
    const t = await team();
    const opened = await openTeamKeys(t.bob.keypair, WS, t.forBob);
    await expect(encryptTeamText(opened, PROJECT, "staging", "A=1\n")).rejects.toThrow(
      "The staging environment has no key yet. Save its first file in the web app.",
    );
    await expect(encryptTeamText(opened, PROJECT, "", "A=1\n")).rejects.toThrow(
      "Files with no environment have no key yet. Save the first one in the web app.",
    );
  });

  it("refuses an environment that exists but this person cannot open", async () => {
    const t = await team();
    const eve = await person("eve");
    const opened = await openTeamKeys(eve.keypair, WS, t.forBob);
    await expect(encryptTeamText(opened, PROJECT, "development", "A=1\n")).rejects.toThrow(NoTeamKeyError);
  });
});
