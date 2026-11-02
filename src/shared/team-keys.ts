// SPDX-License-Identifier: MIT
//
// Team keys: who can open which environment of which project. See
// docs/SHARING_DESIGN.md (section 4) and BLOB_FORMAT.md ("Team keys").
//
// A team workspace has a workspace key, held by its owner and admins. Each
// project has one environment key per environment label; env blobs in a team
// are encrypted under those with crypto.ts's encryptBlob, unchanged. An
// environment key generation is stored three ways:
//
// - under the workspace key, so admins reach every environment;
// - wrapped to each member granted that environment, with an authenticated
//   ECDH seal (HPKE auth mode's shape), so only someone holding the granter's
//   private key could have made it and the server cannot slip in a key of
//   its own;
// - as the chain link that holds the previous generation, so the current key
//   is enough to read every older version.
//
// Every wrap carries what it is for (scope and generation) as AES-GCM
// additional data, so the server cannot move one onto another row.

import { contextData, openWithContext, sealWithContext } from "./aead.ts";
import { AES } from "./constants.ts";
import { importAesKey, randomBytes } from "./crypto.ts";
import { CURVE, type DeviceJwk } from "./device-seal.ts";
import { base64ToBytes, bytesToBase64, utf8ToBytes, type Bytes } from "./encoding.ts";
import type { WrappedKey } from "./types.ts";
import { publicOnly, verifyUserPublicKey, type UserKeypair, type UserPublicKey } from "./user-key.ts";

const WORKSPACE_KEY_INFO = "klef/workspace-key/v1";
const ENV_KEY_INFO = "klef/env-key/v1";
const ENV_KEY_ADMIN_INFO = "klef/env-key-admin/v1";
const ENV_KEY_CHAIN_INFO = "klef/env-key-chain/v1";

export const PERSON_WRAP_ALG = "P256-AUTH+HKDF-SHA256+AES-GCM" as const;

/** A key wrapped to one person. Opaque without their private key. */
export interface PersonWrap {
  v: 1;
  alg: typeof PERSON_WRAP_ALG;
  gen: number;
  /** Fingerprint of the granter's key, whose public half the opener needs. */
  sender: string;
  ephemeralPublicJwk: DeviceJwk;
  nonce: string;
  ciphertext: string;
}

/** What a key is for. The environment label is "" for unlabelled files. */
export type KeyScope =
  | { kind: "workspace"; workspaceId: string }
  | { kind: "env"; workspaceId: string; projectId: string; environment: string };

/** A person a key can be wrapped to: their served public key and user id. */
export interface Member extends UserPublicKey {
  userId: string;
}

/** A fresh 32-byte workspace or environment key. */
export function generateKeyBytes(): Bytes {
  return randomBytes(AES.keyBytes);
}

function scopeContext(scope: KeyScope): [string, ...string[]] {
  return scope.kind === "workspace"
    ? [WORKSPACE_KEY_INFO, scope.workspaceId]
    : [ENV_KEY_INFO, scope.workspaceId, scope.projectId, scope.environment];
}

async function ecdh(privateKey: CryptoKey, publicJwk: DeviceJwk): Promise<Bytes> {
  const peer = await crypto.subtle.importKey("jwk", publicJwk, CURVE, false, []);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: peer }, privateKey, 256));
}

/** HKDF over ECDH(ephemeral, recipient) || ECDH(sender, recipient), as computed by either side. */
async function personKey(first: Bytes, second: Bytes, purpose: string): Promise<CryptoKey> {
  const ikm = new Uint8Array(first.length + second.length);
  ikm.set(first);
  ikm.set(second, first.length);
  first.fill(0);
  second.fill(0);
  const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveKey"]);
  ikm.fill(0);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: utf8ToBytes(purpose) },
    base,
    { name: AES.name, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function personContext(scope: KeyScope, gen: number, sender: string, recipient: string): Bytes {
  const [purpose, ...parts] = scopeContext(scope);
  return contextData(purpose, ...parts, gen, sender, recipient);
}

/**
 * Wrap a key to one person, authenticated as the sender. Refuses a recipient
 * whose fingerprint does not match their public key.
 */
export async function wrapToPerson(
  keyBytes: Bytes,
  scope: KeyScope,
  gen: number,
  sender: UserKeypair,
  recipient: UserPublicKey,
): Promise<PersonWrap> {
  if (!(await verifyUserPublicKey(recipient))) throw new Error("Recipient fingerprint does not match their key");
  const purpose = scopeContext(scope)[0];
  const ephemeral = await crypto.subtle.generateKey(CURVE, true, ["deriveBits"]);
  const key = await personKey(
    await ecdh(ephemeral.privateKey, recipient.publicJwk),
    await ecdh(sender.privateKey, recipient.publicJwk),
    purpose,
  );
  const nonce = randomBytes(AES.nonceBytes);
  const ciphertext = await crypto.subtle.encrypt(
    { name: AES.name, iv: nonce, tagLength: AES.tagBits, additionalData: personContext(scope, gen, sender.fingerprint, recipient.fingerprint) },
    key,
    keyBytes,
  );
  return {
    v: 1,
    alg: PERSON_WRAP_ALG,
    gen,
    sender: sender.fingerprint,
    ephemeralPublicJwk: publicOnly((await crypto.subtle.exportKey("jwk", ephemeral.publicKey)) as DeviceJwk),
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

/**
 * Open a key wrapped to me. `sender` is the granter's served public key; a
 * wrap that names a different sender, or was made for another scope,
 * generation or person, fails to open. The caller zeroes the bytes after use.
 */
export async function openFromPerson(
  wrap: PersonWrap,
  scope: KeyScope,
  gen: number,
  recipient: UserKeypair,
  sender: UserPublicKey,
): Promise<Bytes> {
  if (wrap.v !== 1 || wrap.alg !== PERSON_WRAP_ALG) throw new Error(`Unsupported key wrap: ${wrap.alg}`);
  if (wrap.gen !== gen) throw new Error("Key wrap is for another generation");
  if (wrap.sender !== sender.fingerprint) throw new Error("Key wrap names another sender");
  if (!(await verifyUserPublicKey(sender))) throw new Error("Sender fingerprint does not match their key");
  const purpose = scopeContext(scope)[0];
  const key = await personKey(
    await ecdh(recipient.privateKey, wrap.ephemeralPublicJwk),
    await ecdh(recipient.privateKey, sender.publicJwk),
    purpose,
  );
  const plaintext = await crypto.subtle.decrypt(
    {
      name: AES.name,
      iv: base64ToBytes(wrap.nonce),
      tagLength: AES.tagBits,
      additionalData: personContext(scope, gen, sender.fingerprint, recipient.fingerprint),
    },
    key,
    base64ToBytes(wrap.ciphertext),
  );
  return new Uint8Array(plaintext);
}

// --- environment keys under the workspace key, and chains -------------------

/** Where an environment key generation sits, as bound into its admin wrap. */
export interface EnvKeyRef {
  workspaceId: string;
  projectId: string;
  environment: string;
  gen: number;
  /** The workspace key generation that wraps it. */
  workspaceGen: number;
}

function adminContext(ref: EnvKeyRef): Bytes {
  return contextData(ENV_KEY_ADMIN_INFO, ref.workspaceId, ref.projectId, ref.environment, ref.gen, ref.workspaceGen);
}

/** Store an environment key generation under the workspace key. */
export async function wrapEnvKeyForAdmins(workspaceKey: Bytes, envKey: Bytes, ref: EnvKeyRef): Promise<WrappedKey> {
  return sealWithContext(await importAesKey(workspaceKey), envKey, adminContext(ref));
}

/** Open an environment key as an admin. */
export async function openEnvKeyAsAdmin(workspaceKey: Bytes, wrapped: WrappedKey, ref: EnvKeyRef): Promise<Bytes> {
  return openWithContext(await importAesKey(workspaceKey), wrapped, adminContext(ref));
}

/**
 * The chain link: generation `gen - 1` under generation `gen`. Bound to the
 * project and environment but not the workspace, so a project keeps its
 * chain when it moves to another team.
 */
function chainContext(projectId: string, environment: string, gen: number): Bytes {
  return contextData(ENV_KEY_CHAIN_INFO, projectId, environment, gen);
}

export async function chainEnvKey(
  current: Bytes,
  previous: Bytes,
  link: { projectId: string; environment: string; gen: number },
): Promise<WrappedKey> {
  return sealWithContext(await importAesKey(current), previous, chainContext(link.projectId, link.environment, link.gen));
}

/**
 * Walk back from the current generation to `target`. `links[g]` is the chain
 * link stored with generation g (it holds g - 1). Returns the target key's
 * bytes; intermediate keys are zeroed.
 */
export async function envKeyAtGen(
  current: { gen: number; key: Bytes },
  target: number,
  links: Readonly<Record<number, WrappedKey | undefined>>,
  scope: { projectId: string; environment: string },
): Promise<Bytes> {
  if (!Number.isInteger(target) || target < 1 || target > current.gen) {
    throw new Error(`No generation ${target} below ${current.gen}`);
  }
  let key = current.key.slice();
  for (let gen = current.gen; gen > target; gen--) {
    const link = links[gen];
    if (!link) throw new Error(`Missing key chain link for generation ${gen}`);
    const previous = await openWithContext(await importAesKey(key), link, chainContext(scope.projectId, scope.environment, gen));
    key.fill(0);
    key = previous;
  }
  return key;
}

// --- making generations, and rotation -----------------------------------------

/** One environment key generation, ready to store. */
export interface EnvKeyGeneration {
  projectId: string;
  environment: string;
  gen: number;
  workspaceGen: number;
  adminWrapped: WrappedKey;
  /** The previous generation under this one; absent for generation 1. */
  prevWrapped?: WrappedKey;
  grants: { userId: string; wrap: PersonWrap }[];
}

/**
 * Make the next generation of an environment key (or the first, when
 * `previous` is absent): a fresh key, stored under the workspace key, chained
 * to the previous one, and wrapped to each grantee.
 */
export async function nextEnvKey(input: {
  workspaceId: string;
  projectId: string;
  environment: string;
  previous?: { gen: number; key: Bytes };
  workspace: { gen: number; key: Bytes };
  sender: UserKeypair;
  grantees: readonly Member[];
}): Promise<{ generation: EnvKeyGeneration; key: Bytes }> {
  const gen = (input.previous?.gen ?? 0) + 1;
  const key = generateKeyBytes();
  const scope: KeyScope = {
    kind: "env",
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    environment: input.environment,
  };
  const generation: EnvKeyGeneration = {
    projectId: input.projectId,
    environment: input.environment,
    gen,
    workspaceGen: input.workspace.gen,
    adminWrapped: await wrapEnvKeyForAdmins(input.workspace.key, key, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      environment: input.environment,
      gen,
      workspaceGen: input.workspace.gen,
    }),
    grants: [],
  };
  if (input.previous) {
    generation.prevWrapped = await chainEnvKey(key, input.previous.key, {
      projectId: input.projectId,
      environment: input.environment,
      gen,
    });
  }
  for (const member of input.grantees) {
    generation.grants.push({ userId: member.userId, wrap: await wrapToPerson(key, scope, gen, input.sender, member) });
  }
  return { generation, key };
}

/** A new workspace key generation, wrapped to the owner and every admin. */
export async function nextWorkspaceKey(input: {
  workspaceId: string;
  previousGen?: number;
  sender: UserKeypair;
  admins: readonly Member[];
}): Promise<{ gen: number; key: Bytes; wraps: { userId: string; wrap: PersonWrap }[] }> {
  const gen = (input.previousGen ?? 0) + 1;
  const key = generateKeyBytes();
  const scope: KeyScope = { kind: "workspace", workspaceId: input.workspaceId };
  const wraps = [];
  for (const admin of input.admins) {
    wraps.push({ userId: admin.userId, wrap: await wrapToPerson(key, scope, gen, input.sender, admin) });
  }
  return { gen, key, wraps };
}

/** An environment key as the rotating client holds it, with who should keep it. */
export interface HeldEnvKey {
  projectId: string;
  environment: string;
  gen: number;
  key: Bytes;
  /** Members (not admins) granted this environment after the change. */
  grantees: readonly Member[];
}

/** The body of a rotation request. */
export interface RotationPlan {
  workspace?: { gen: number; wraps: { userId: string; wrap: PersonWrap }[] };
  envKeys: EnvKeyGeneration[];
}

/**
 * Which environment keys a change has to rotate. Someone who could open an
 * environment and no longer can (removed, lost a grant) forces that one; an
 * admin leaving forces every key, since the workspace key reached them all.
 */
export function keysToRotate(input: {
  adminRemoved: boolean;
  envKeys: readonly { projectId: string; environment: string }[];
  lostGrants: readonly { projectId: string; environment: string }[];
}): { workspace: boolean; envKeys: { projectId: string; environment: string }[] } {
  if (input.adminRemoved) return { workspace: true, envKeys: [...input.envKeys] };
  const lost = new Set(input.lostGrants.map((g) => `${g.projectId}\n${g.environment}`));
  return { workspace: false, envKeys: input.envKeys.filter((k) => lost.has(`${k.projectId}\n${k.environment}`)) };
}

/**
 * Build a rotation: a new workspace key when `rotateWorkspace` (wrapped to
 * the remaining admins), and the next generation of each listed environment
 * key, under the workspace key that is current afterwards. Atomic on the
 * server; the returned keys let the caller keep working without refetching.
 */
export async function planRotation(input: {
  workspaceId: string;
  sender: UserKeypair;
  workspace: { gen: number; key: Bytes };
  rotateWorkspace: boolean;
  admins: readonly Member[];
  envKeys: readonly HeldEnvKey[];
}): Promise<{ plan: RotationPlan; workspaceKey: { gen: number; key: Bytes }; envKeys: Map<string, { gen: number; key: Bytes }> }> {
  const plan: RotationPlan = { envKeys: [] };
  let workspace = input.workspace;
  if (input.rotateWorkspace) {
    const next = await nextWorkspaceKey({
      workspaceId: input.workspaceId,
      previousGen: input.workspace.gen,
      sender: input.sender,
      admins: input.admins,
    });
    plan.workspace = { gen: next.gen, wraps: next.wraps };
    workspace = { gen: next.gen, key: next.key };
  }
  const envKeys = new Map<string, { gen: number; key: Bytes }>();
  for (const held of input.envKeys) {
    const { generation, key } = await nextEnvKey({
      workspaceId: input.workspaceId,
      projectId: held.projectId,
      environment: held.environment,
      previous: { gen: held.gen, key: held.key },
      workspace,
      sender: input.sender,
      grantees: held.grantees,
    });
    plan.envKeys.push(generation);
    envKeys.set(`${held.projectId}\n${held.environment}`, { gen: generation.gen, key });
  }
  return { plan, workspaceKey: workspace, envKeys };
}

/** Shape check for a wrap from the wire. */
export function isPersonWrap(v: unknown): v is PersonWrap {
  if (typeof v !== "object" || v === null) return false;
  const w = v as Record<string, unknown>;
  const jwk = w.ephemeralPublicJwk as Record<string, unknown> | null;
  return (
    w.v === 1 &&
    w.alg === PERSON_WRAP_ALG &&
    Number.isInteger(w.gen) && (w.gen as number) >= 1 &&
    typeof w.sender === "string" &&
    typeof w.nonce === "string" &&
    typeof w.ciphertext === "string" &&
    typeof jwk === "object" && jwk !== null &&
    jwk.kty === "EC" && jwk.crv === "P-256" && typeof jwk.x === "string" && typeof jwk.y === "string"
  );
}
