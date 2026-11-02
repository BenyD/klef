import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { VaultTree, WorkspaceKeysResponse } from "../shared/api-types.ts";
import { decryptBlob, encryptBlob, importAesKey, randomBytes, setupVault } from "../shared/crypto.ts";
import { nextEnvKey, nextWorkspaceKey, planRotation, type Member } from "../shared/team-keys.ts";
import { generateUserKey, type UserKeyRecord } from "../shared/user-key.ts";
import type { EncryptedBlob } from "../shared/types.ts";
import { vaultFingerprint } from "./agent-protocol.ts";
import { startAgent } from "./agent.ts";
import { ApiError } from "./api.ts";
import { CliError } from "./ui.ts";
import { vaultFiles } from "./vault-files.ts";
import { agentCipher, localCipher } from "./vault-key.ts";

// A team member's CLI against a stand-in server whose responses are built
// with the same core functions the web app uses to make them.

const WS = "11111111-1111-4111-8111-111111111111";
const PROJECT = "project-1";

const tree: VaultTree = {
  workspaces: [
    {
      id: WS,
      name: "Acme",
      icon: null,
      createdAt: "",
      team: { keyGen: 1, role: "member", trialEndsAt: null, plan: "trial" },
      projects: [
        {
          id: PROJECT,
          name: "api",
          framework: null,
          icon: null,
          createdAt: "",
          files: [
            { id: "dev", name: ".env.development", currentVersionId: "v1", environment: "development", createdAt: "", access: "write" },
            { id: "prod", name: ".env.production", currentVersionId: null, environment: "production", createdAt: "", access: "none" },
          ],
        },
      ],
    },
    {
      id: "mine",
      name: "Mine",
      icon: null,
      createdAt: "",
      team: null,
      projects: [{ id: "p2", name: "x", framework: null, icon: null, createdAt: "", files: [{ id: "personal", name: ".env", currentVersionId: null, environment: null, createdAt: "" }] }],
    },
  ],
};

async function scenario() {
  const ownerDek = await importAesKey(randomBytes(32));
  const owner = (await generateUserKey(ownerDek, "owner")).keypair;
  const ownerMember: Member = { userId: "owner", publicJwk: owner.publicJwk, fingerprint: owner.fingerprint };

  const bobVault = await setupVault("bob passphrase");
  const bob = await generateUserKey(bobVault.dek, "bob");
  const bobMember: Member = { userId: "bob", publicJwk: bob.keypair.publicJwk, fingerprint: bob.keypair.fingerprint };

  const ws = await nextWorkspaceKey({ workspaceId: WS, sender: owner, admins: [ownerMember] });
  const workspace = { gen: 1, key: ws.key };
  const g1 = await nextEnvKey({ workspaceId: WS, projectId: PROJECT, environment: "development", workspace, sender: owner, grantees: [bobMember] });

  let keys: WorkspaceKeysResponse = {
    workspace: null,
    envKeys: [{
      id: "dev-key", projectId: PROJECT, environment: "development", gen: 1,
      gens: [{ gen: 1, workspaceGen: 1, adminWrapped: null, prevWrapped: null }],
      grant: { access: "write", keyGen: 1, wrap: g1.generation.grants[0]!.wrap },
    }],
    senders: { [owner.fingerprint]: owner.publicJwk },
    senderInfo: { [owner.fingerprint]: { userId: "owner", role: "owner" } },
  };

  /** The owner rotates development; Bob keeps access to the new generation. */
  const rotate = async () => {
    const { plan, envKeys } = await planRotation({
      workspaceId: WS, sender: owner, workspace, rotateWorkspace: false, admins: [ownerMember],
      envKeys: [{ projectId: PROJECT, environment: "development", gen: 1, key: g1.key, grantees: [bobMember] }],
    });
    const g2 = plan.envKeys[0]!;
    keys = {
      ...keys,
      envKeys: [{
        id: "dev-key", projectId: PROJECT, environment: "development", gen: 2,
        gens: [
          { gen: 1, workspaceGen: 1, adminWrapped: null, prevWrapped: null },
          { gen: 2, workspaceGen: 1, adminWrapped: null, prevWrapped: g2.prevWrapped! },
        ],
        grant: { access: "write", keyGen: 2, wrap: g2.grants[0]!.wrap },
      }],
    };
    return envKeys.get(`${PROJECT}\ndevelopment`)!.key;
  };

  const saved: { fileId: string; blob: EncryptedBlob; keyGen?: number }[] = [];
  let storedKey: UserKeyRecord | null = bob.record;
  let currentGen = 1;
  let readOnly = false;
  const api = {
    whoami: async () => ({ user: { id: "bob", email: "bob@acme.dev", name: "Bob" } }),
    myKey: async () => ({ key: storedKey ? { ...storedKey, pins: null, createdAt: "" } : null }),
    putMyKey: async (r: UserKeyRecord) => {
      storedKey = r;
      return { ok: true as const };
    },
    workspaceKeys: async () => keys,
    saveVersion: async (fileId: string, blob: EncryptedBlob, keyGen?: number) => {
      if (readOnly) throw new ApiError("You can read this environment but not change it", 403, { reason: "read_only" });
      if (keyGen !== undefined && keyGen !== currentGen) throw new ApiError("The key changed", 409, { reason: "key_rotated" });
      saved.push({ fileId, blob, keyGen });
      return { id: `v${saved.length}`, createdAt: "" };
    },
  };
  return {
    api, bobVault, g1, saved, rotate,
    setGen: (g: number) => (currentGen = g),
    setReadOnly: () => (readOnly = true),
    clearKey: () => (storedKey = null),
    storedKey: () => storedKey,
  };
}

describe("a team member's CLI", () => {
  it("reads and writes development, and saves personal files as before", async () => {
    const s = await scenario();
    const files = vaultFiles(s.api, tree, localCipher(s.bobVault.dek));
    const blob = await encryptBlob(await importAesKey(s.g1.key), "A=1\n");
    expect(await files.decrypt({ blob, keyScope: "dev-key", keyGen: 1 })).toBe("A=1\n");

    await files.save("dev", "A=2\n");
    expect(s.saved[0]!.keyGen).toBe(1);
    expect(await decryptBlob(await importAesKey(s.g1.key), s.saved[0]!.blob)).toBe("A=2\n");

    await files.save("personal", "P=1\n");
    expect(s.saved[1]!.keyGen).toBeUndefined();
    expect(await decryptBlob(s.bobVault.dek, s.saved[1]!.blob)).toBe("P=1\n");
  });

  it("refetches keys once after a rotation, and still reads older versions", async () => {
    const s = await scenario();
    const files = vaultFiles(s.api, tree, localCipher(s.bobVault.dek));
    const old = await encryptBlob(await importAesKey(s.g1.key), "OLD=1\n");
    await files.decrypt({ blob: old, keyScope: "dev-key", keyGen: 1 });

    const g2 = await s.rotate();
    s.setGen(2);
    await files.save("dev", "NEW=1\n");
    expect(s.saved[0]!.keyGen).toBe(2);
    expect(await decryptBlob(await importAesKey(g2), s.saved[0]!.blob)).toBe("NEW=1\n");
    expect(await files.decrypt({ blob: old, keyScope: "dev-key", keyGen: 1 })).toBe("OLD=1\n");
  });

  it("says no_access for an environment it holds no key for, and for a read-only push", async () => {
    const s = await scenario();
    const files = vaultFiles(s.api, tree, localCipher(s.bobVault.dek));
    const blob = await encryptBlob(await importAesKey(randomBytes(32)), "X=1\n");
    await expect(files.decrypt({ blob, keyScope: "prod-key", keyGen: 1 })).rejects.toMatchObject({ code: "no_access" });
    await expect(files.save("prod", "X=1\n")).rejects.toMatchObject({ code: "no_access" });
    s.setReadOnly();
    const err = await files.save("dev", "X=1\n").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CliError);
    expect(err).toMatchObject({ code: "no_access" });
  });

  it("makes and uploads a sharing key the first time a team needs one", async () => {
    const s = await scenario();
    s.clearKey();
    const files = vaultFiles(s.api, tree, localCipher(s.bobVault.dek));
    // The new key has no grant yet, so the read fails, but the key is stored.
    const blob = await encryptBlob(await importAesKey(s.g1.key), "A=1\n");
    await expect(files.decrypt({ blob, keyScope: "dev-key", keyGen: 1 })).rejects.toThrow();
    expect(s.storedKey()?.fingerprint).toMatch(/^[0-9a-f]{32}$/);
  });

  it("does the same through the unlock agent, which keeps every key to itself", async () => {
    const s = await scenario();
    const dir = await mkdtemp(path.join(tmpdir(), "klef-team-agent-"));
    const socketPath = path.join(dir, "run", "agent.sock");
    const agent = await startAgent({
      dek: s.bobVault.dek,
      fingerprint: await vaultFingerprint(s.bobVault.keyMaterial.wrappedDek),
      socketPath,
      idleMs: 60_000,
    });
    try {
      const files = vaultFiles(s.api, tree, agentCipher(socketPath));
      const blob = await encryptBlob(await importAesKey(s.g1.key), "A=1\n");
      expect(await files.decrypt({ blob, keyScope: "dev-key", keyGen: 1 })).toBe("A=1\n");
      await files.save("dev", "A=2\n");
      expect(await decryptBlob(await importAesKey(s.g1.key), s.saved[0]!.blob)).toBe("A=2\n");
      await expect(files.save("prod", "X=1\n")).rejects.toThrow(/production environment has no key/);
    } finally {
      await agent.lock();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses a key given out by someone who is not an admin", async () => {
    const s = await scenario();
    const forged = vaultFiles(
      { ...s.api, workspaceKeys: async () => ({ ...(await s.api.workspaceKeys()), senderInfo: { [Object.keys((await s.api.workspaceKeys()).senders)[0]!]: { userId: "owner", role: "member" } } }) },
      tree,
      localCipher(s.bobVault.dek),
    );
    const blob = await encryptBlob(await importAesKey(s.g1.key), "A=1\n");
    await expect(forged.decrypt({ blob, keyScope: "dev-key", keyGen: 1 })).rejects.toThrow();
  });

  it("saves a file created after the tree was read under its team's key", async () => {
    const s = await scenario();
    const files = vaultFiles(s.api, tree, localCipher(s.bobVault.dek));
    files.track("new-dev-file", { projectId: PROJECT, environment: "development" });
    await files.save("new-dev-file", "NEW=1\n");
    expect(s.saved[0]!.keyGen).toBe(1);
  });
});
