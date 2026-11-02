// SPDX-License-Identifier: MIT
//
// The team operations a vault cipher offers, done next to the DEK: in this
// process when the key is held here, or inside the unlock agent when it is
// held there (agent.ts runs these same functions). Either way the caller
// passes what the server served (the sharing key record and a team's keys
// response) and gets back plaintext or a blob, never a key.

import type { WorkspaceKeysResponse } from "../shared/core.ts";
import {
  decryptTeamBlob,
  distrustMessage,
  encryptTeamText,
  generateUserKey,
  NoTeamKeyError,
  openPins,
  openTeamKeys,
  openUserKey,
  trustSender,
  type EncryptedBlob,
  type UserKeyRecord,
  type WrappedKey,
} from "../shared/core.ts";

/** What opening one team's keys takes. */
export interface TeamKeyRequest {
  userId: string;
  userKey: UserKeyRecord;
  workspaceId: string;
  keys: WorkspaceKeysResponse;
  /** The account's pinned fingerprints, sealed under the DEK (null for none). */
  pins?: WrappedKey | null;
}

export interface TeamDecryptRequest extends TeamKeyRequest {
  blob: EncryptedBlob;
  keyScope: string;
  keyGen: number;
}

export interface TeamEncryptRequest extends TeamKeyRequest {
  projectId: string;
  /** The file's environment label, "" when it has none. */
  environment: string;
  plaintext: string;
}

export interface TeamOps {
  teamDecrypt(req: TeamDecryptRequest): Promise<string>;
  teamEncrypt(req: TeamEncryptRequest): Promise<{ blob: EncryptedBlob; keyGen: number }>;
  /** A new sharing keypair, its private half sealed under the DEK, ready to upload. */
  newUserKey(userId: string): Promise<UserKeyRecord>;
}

// Wraps are used only from a sender entitled to give them: a current owner
// or admin, or a key this account pinned before for that person (the web
// app pins; the CLI only reads). See src/shared/team-trust.ts.
async function open(dek: CryptoKey, req: TeamKeyRequest) {
  const [me, pins] = await Promise.all([openUserKey(dek, req.userId, req.userKey), openPins(dek, req.userId, req.pins ?? null).catch(() => ({}))]);
  return openTeamKeys(me, req.workspaceId, req.keys, {
    trust: (fingerprint) => {
      const verdict = trustSender(fingerprint, req.keys.senderInfo?.[fingerprint], pins);
      if (!verdict.ok) throw new NoTeamKeyError(distrustMessage(verdict.reason));
    },
  });
}

/** Team operations over a DEK held in this process. */
export function teamOps(dek: CryptoKey): TeamOps {
  return {
    async teamDecrypt(req) {
      return decryptTeamBlob(await open(dek, req), req.blob, req.keyScope, req.keyGen);
    },
    async teamEncrypt(req) {
      return encryptTeamText(await open(dek, req), req.projectId, req.environment, req.plaintext);
    },
    async newUserKey(userId) {
      return (await generateUserKey(dek, userId)).record;
    },
  };
}
