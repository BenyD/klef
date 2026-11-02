// SPDX-License-Identifier: MIT
//
// Opening a team's keys from what the server hands one person
// (GET /api/workspaces/:id/keys), and using them on env blobs. Shared by the
// web app, the CLI and the CLI's unlock agent, so all three open team keys
// the same way. Design: docs/SHARING_DESIGN.md, section 4.
//
//   my private key -> workspace key (owners, admins) or my grant (members)
//                  -> environment key -> chain back to a version's generation
//
// Pure: no network. The caller fetches the keys response and supplies the
// opened sharing keypair.

import type { WorkspaceKeysResponse } from "./api-types.ts";
import { decryptBlob, encryptBlob, importAesKey } from "./crypto.ts";
import type { Bytes } from "./encoding.ts";
import { envKeyAtGen, openEnvKeyAsAdmin, openFromPerson } from "./team-keys.ts";
import type { EncryptedBlob, WrappedKey } from "./types.ts";
import type { UserKeypair } from "./user-key.ts";

/** This person has no key for what they asked to open or write. */
export class NoTeamKeyError extends Error {}

export interface EnvKeyState {
  id: string;
  projectId: string;
  environment: string;
  gen: number;
  /** The current generation's bytes, or null if this person cannot open it. */
  current: Bytes | null;
  /** links[g] holds generation g - 1 under generation g. */
  links: Record<number, WrappedKey | undefined>;
}

export interface OpenedTeamKeys {
  workspaceId: string;
  /** Owners and admins only. */
  workspace: { gen: number; key: Bytes } | null;
  /** By environment key id (a version's keyScope). */
  envKeys: Map<string, EnvKeyState>;
}

export interface OpenOptions {
  /**
   * Called with each wrap's sender before it is used; throw to refuse it
   * (team-trust.ts). Without it every sender in the response is accepted.
   */
  trust?: (fingerprint: string) => void;
}

/**
 * Open everything in a keys response that `me` can open. Wraps are checked
 * against their senders' public keys from the same response, each of those
 * against its fingerprint, and each sender against `options.trust`. A wrap
 * that fails any of that is skipped, not fatal: the rest of the team still
 * opens, and what was skipped reads as a key this person does not hold.
 */
export async function openTeamKeys(
  me: UserKeypair,
  workspaceId: string,
  keys: WorkspaceKeysResponse,
  options: OpenOptions = {},
): Promise<OpenedTeamKeys> {
  const sender = (fingerprint: string) => {
    options.trust?.(fingerprint);
    const publicJwk = keys.senders[fingerprint];
    if (!publicJwk) throw new Error("A team key was made by someone whose key is missing");
    return { publicJwk, fingerprint };
  };
  const attempt = <T,>(open: () => Promise<T>): Promise<T | null> => open().catch(() => null);

  let workspace: OpenedTeamKeys["workspace"] = null;
  if (keys.workspace) {
    const { gen, wrap } = keys.workspace;
    const key = await attempt(() => openFromPerson(wrap, { kind: "workspace", workspaceId }, gen, me, sender(wrap.sender)));
    workspace = key ? { gen, key } : null;
  }

  const envKeys = new Map<string, EnvKeyState>();
  for (const k of keys.envKeys) {
    const links: Record<number, WrappedKey | undefined> = {};
    for (const g of k.gens) links[g.gen] = g.prevWrapped ?? undefined;
    let current: Bytes | null = null;
    if (k.grant && k.grant.keyGen === k.gen) {
      const scope = { kind: "env" as const, workspaceId, projectId: k.projectId, environment: k.environment };
      const grant = k.grant;
      current = await attempt(() => openFromPerson(grant.wrap, scope, k.gen, me, sender(grant.wrap.sender)));
    } else if (workspace) {
      const ws = workspace;
      const g = k.gens.find((x) => x.gen === k.gen);
      if (g?.adminWrapped && g.workspaceGen === ws.gen) {
        const adminWrapped = g.adminWrapped;
        current = await attempt(() =>
          openEnvKeyAsAdmin(ws.key, adminWrapped, {
            workspaceId,
            projectId: k.projectId,
            environment: k.environment,
            gen: k.gen,
            workspaceGen: g.workspaceGen,
          }),
        );
      }
    }
    envKeys.set(k.id, { id: k.id, projectId: k.projectId, environment: k.environment, gen: k.gen, current, links });
  }
  return { workspaceId, workspace, envKeys };
}

/** The environment key for a project and label ("" for unlabelled files). */
export function envKeyFor(opened: OpenedTeamKeys, projectId: string, environment: string): EnvKeyState | undefined {
  for (const state of opened.envKeys.values()) {
    if (state.projectId === projectId && state.environment === environment) return state;
  }
  return undefined;
}

/** One generation of an environment key, as a non-extractable AES key. */
export async function envKeyAt(state: EnvKeyState, gen: number): Promise<CryptoKey> {
  if (!state.current) throw new NoTeamKeyError("You do not have the key for this environment.");
  const bytes = await envKeyAtGen({ gen: state.gen, key: state.current }, gen, state.links, {
    projectId: state.projectId,
    environment: state.environment,
  });
  try {
    return await importAesKey(bytes);
  } finally {
    if (bytes !== state.current) bytes.fill(0);
  }
}

/** Decrypt a team version: its blob, under the key and generation it names. */
export async function decryptTeamBlob(opened: OpenedTeamKeys, blob: EncryptedBlob, keyScope: string, keyGen: number): Promise<string> {
  const state = opened.envKeys.get(keyScope);
  if (!state) throw new NoTeamKeyError("You do not have the key for this environment.");
  return decryptBlob(await envKeyAt(state, keyGen), blob);
}

/**
 * Encrypt text for a team file under its environment's current key. An
 * environment without a key yet gets one from an owner's or admin's first
 * save (the web app makes it); here that is an error to act on.
 */
export async function encryptTeamText(
  opened: OpenedTeamKeys,
  projectId: string,
  environment: string,
  text: string,
): Promise<{ blob: EncryptedBlob; keyGen: number }> {
  const state = envKeyFor(opened, projectId, environment);
  if (!state) {
    throw new NoTeamKeyError(
      environment
        ? `The ${environment} environment has no key yet. Save its first file in the web app.`
        : "Files with no environment have no key yet. Save the first one in the web app.",
    );
  }
  return { blob: await encryptBlob(await envKeyAt(state, state.gen), text), keyGen: state.gen };
}
