// SPDX-License-Identifier: MIT
//
// Reading and saving a file's text with the right key. Personal files go
// through the vault cipher as they always have. A team file's version names
// its environment key; for it, this fetches the team's keys (wrapped) and my
// sharing key record (sealed under my DEK), and hands both to the cipher,
// which opens them next to the DEK: in this process, or in the unlock agent.
// Nothing here ever holds a key. Design: docs/SHARING_DESIGN.md, section 11.

import type { VaultTree, WorkspaceKeysResponse } from "../shared/api-types.ts";
import { NoTeamKeyError } from "../shared/team-unlock.ts";
import type { EncryptedBlob, WrappedKey } from "../shared/types.ts";
import type { UserKeyRecord } from "../shared/user-key.ts";
import { ApiError, type KlefApi } from "./api.ts";
import type { TeamKeyRequest } from "./team-cipher.ts";
import { CliError } from "./ui.ts";
import type { VaultCipher } from "./vault-key.ts";

export interface StoredVersion {
  blob: EncryptedBlob;
  keyScope?: string | null;
  keyGen?: number | null;
}

interface Place {
  workspaceId: string;
  projectId: string;
  environment: string;
  team: boolean;
}

export interface VaultFiles {
  /** The text of a stored version, whichever key it is under. */
  decrypt(version: StoredVersion): Promise<string>;
  /** Encrypt `text` for this file and save it as a new version. */
  save(fileId: string, text: string): Promise<{ id: string; createdAt: string }>;
  /** A file created since the tree was read, so a save knows which team (if any) it is in. */
  track(fileId: string, file: { projectId: string; environment: string | null }): void;
}

type Api = Pick<KlefApi, "whoami" | "myKey" | "putMyKey" | "workspaceKeys" | "saveVersion">;

/** A read-only member pushing, or an environment that has no key yet: say what to do. */
function teamWriteError(err: unknown): never {
  if (err instanceof NoTeamKeyError) throw new CliError("no_access", err.message);
  if (err instanceof ApiError && (err.reason === "read_only" || err.reason === "no_access" || err.reason === "not_admin")) {
    throw new CliError("no_access", err.message, { hint: "Ask a team admin for edit access to this environment." });
  }
  throw err;
}

export function vaultFiles(api: Api, tree: VaultTree, cipher: VaultCipher): VaultFiles {
  const places = new Map<string, Place>();
  const teams = new Set<string>();
  const projectWorkspace = new Map<string, { workspaceId: string; team: boolean }>();
  for (const ws of tree.workspaces) {
    if (ws.team) teams.add(ws.id);
    for (const p of ws.projects) {
      projectWorkspace.set(p.id, { workspaceId: ws.id, team: !!ws.team });
      for (const f of p.files) {
        places.set(f.id, { workspaceId: ws.id, projectId: p.id, environment: f.environment ?? "", team: !!ws.team });
      }
    }
  }

  let me: Promise<{ userId: string; userKey: UserKeyRecord; pins: WrappedKey | null }> | null = null;
  const keys = new Map<string, Promise<WorkspaceKeysResponse>>();

  // My sharing key, made (inside the cipher, under my DEK) and uploaded the
  // first time a team needs it.
  function identity() {
    me ??= (async () => {
      const { user } = await api.whoami();
      const { key } = await api.myKey();
      if (key) return { userId: user.id, userKey: key, pins: key.pins ?? null };
      const userKey = await cipher.newUserKey(user.id);
      try {
        await api.putMyKey(userKey);
        return { userId: user.id, userKey, pins: null };
      } catch (err) {
        // Another device made one first: use the stored key.
        if (err instanceof ApiError && err.status === 409) {
          const again = await api.myKey();
          if (again.key) return { userId: user.id, userKey: again.key, pins: again.key.pins ?? null };
        }
        throw err;
      }
    })();
    return me;
  }

  function teamKeys(workspaceId: string, fresh = false) {
    let k = keys.get(workspaceId);
    if (!k || fresh) {
      k = api.workspaceKeys(workspaceId);
      keys.set(workspaceId, k);
      k.catch(() => keys.delete(workspaceId));
    }
    return k;
  }

  async function request(workspaceId: string, fresh = false): Promise<TeamKeyRequest> {
    const [{ userId, userKey, pins }, k] = await Promise.all([identity(), teamKeys(workspaceId, fresh)]);
    return { userId, userKey, workspaceId, keys: k, pins };
  }

  return {
    track(fileId, file) {
      const ws = projectWorkspace.get(file.projectId);
      if (ws) places.set(fileId, { workspaceId: ws.workspaceId, projectId: file.projectId, environment: file.environment ?? "", team: ws.team });
    },

    async decrypt(version) {
      if (!version.keyScope || version.keyGen == null) return cipher.decrypt(version.blob);
      for (const workspaceId of teams) {
        const req = await request(workspaceId);
        if (!req.keys.envKeys.some((k) => k.id === version.keyScope)) continue;
        return cipher
          .teamDecrypt({ ...req, blob: version.blob, keyScope: version.keyScope, keyGen: version.keyGen })
          .catch((err: unknown) => {
            if (err instanceof NoTeamKeyError) throw new CliError("no_access", err.message);
            throw err;
          });
      }
      throw new CliError("no_access", "You do not have the key for this file's environment.", {
        hint: "Ask a team admin to give you access in the web app.",
      });
    },

    async save(fileId, text) {
      const place = places.get(fileId);
      if (!place?.team) return api.saveVersion(fileId, await cipher.encrypt(text));
      const once = async (fresh: boolean) => {
        const { blob, keyGen } = await cipher.teamEncrypt({
          ...(await request(place.workspaceId, fresh)),
          projectId: place.projectId,
          environment: place.environment,
          plaintext: text,
        });
        return api.saveVersion(fileId, blob, keyGen);
      };
      try {
        return await once(false);
      } catch (err) {
        // The keys changed under us (someone rotated): fetch them once more.
        if (!(err instanceof ApiError && err.reason === "key_rotated")) teamWriteError(err);
        return once(true).catch(teamWriteError);
      }
    },
  };
}
