// SPDX-License-Identifier: MIT
//
// App-level DTOs shared between the Worker API and the client. These describe
// navigation structure (plaintext names) — NOT the crypto contract (see
// types.ts / BLOB_FORMAT.md).

import type { WrappedKey } from "./types.ts";
import type { DeviceJwk } from "./device-seal.ts";
import type { PersonWrap } from "./team-keys.ts";

/**
 * A per-passkey DEK wrap for WebAuthn PRF unlock. The wrap is opaque
 * ciphertext and the salt is a public PRF input; neither lets the server
 * decrypt anything.
 */
export interface VaultPasskeyWrap {
  /** Better Auth passkey row id (owns the wrap's lifecycle). */
  passkeyId: string;
  /** WebAuthn credential id, base64url, as Better Auth stores it. */
  credentialId: string;
  /** PRF eval input, base64. */
  prfSalt: string;
  /** The DEK wrapped under the PRF-derived key. */
  wrappedDek: WrappedKey;
}

/** Built-in environment labels (Vercel-style), shown first in pickers. */
export const ENVIRONMENTS = ["development", "preview", "production"] as const;
export type PresetEnvironment = (typeof ENVIRONMENTS)[number];
/** Environment label: one of the presets or a short custom label. */
export type Environment = string;

export function isPresetEnvironment(v: string): v is PresetEnvironment {
  return (ENVIRONMENTS as readonly string[]).includes(v);
}

/**
 * Canonical form of an environment label, or null when invalid. Shared by the
 * Worker (request validation) and the client (picker input) so both enforce
 * the same rules: trimmed, ≤32 chars, word chars/spaces/dots/dashes only.
 * Case-variants of the presets fold onto the canonical lowercase form.
 */
export function normalizeEnvironment(input: string): string | null {
  const label = input.trim().replace(/\s+/g, " ");
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,31}$/.test(label)) return null;
  const lower = label.toLowerCase();
  return isPresetEnvironment(lower) ? lower : label;
}

/**
 * Known tech stacks; picking one tunes default env-file names per environment.
 * Presented as "Tech stack" in the UI; kept as `framework` in the data model
 * and API for stability.
 */
export const FRAMEWORKS = [
  // Frontend & full-stack
  "nextjs",
  "vite",
  "nuxt",
  "sveltekit",
  "astro",
  "remix",
  "expo",
  // Backend
  "node",
  "bun",
  "deno",
  "go",
  "django",
  "flask",
  "fastapi",
  "rails",
  "laravel",
  "spring",
  "dotnet",
  // Databases & services
  "postgres",
  "mysql",
  "sqlite",
  "redis",
  "prisma",
  "supabase",
  "firebase",
  "docker",
  "other",
] as const;
export type Framework = (typeof FRAMEWORKS)[number];

export interface EnvFileNode {
  id: string;
  name: string;
  /** Null until the file's first save (Phase 5). */
  currentVersionId: string | null;
  /** Optional environment label; plaintext like the name. */
  environment: Environment | null;
  createdAt: string;
  /**
   * Team files only: what the caller can do with it. "none" files are listed
   * by name and never fetched.
   */
  access?: "admin" | "write" | "read" | "none";
}

export interface ProjectNode {
  id: string;
  name: string;
  /** Optional framework; plaintext, only used for UI defaults. */
  framework: Framework | null;
  /** Optional icon: https URL or small data: URL; falls back to the framework icon. */
  icon: string | null;
  createdAt: string;
  files: EnvFileNode[];
}

export interface WorkspaceNode {
  id: string;
  name: string;
  /** Uploaded image (data URL) or https URL; null shows the cube glyph. */
  icon: string | null;
  createdAt: string;
  /**
   * Set for a team workspace; null for a personal one. Absent from servers
   * that predate teams, which is the same as personal.
   */
  team?: TeamInfo | null;
  projects: ProjectNode[];
}

/** What a member sees about the team a workspace is. */
export interface TeamInfo {
  /** Current workspace key generation. */
  keyGen: number;
  role: "owner" | "admin" | "member";
  /** End of the Team trial, ISO 8601; null when there is none. */
  trialEndsAt: string | null;
  /** Paid, in its trial, or neither (read-only until its owner picks a plan). */
  plan: TeamPlan;
}

/** Whether a team can grow: "active" when paid, "trial" in its free days, else "inactive" (src/api/team-billing.ts). */
export type TeamPlan = "trial" | "active" | "inactive";

/** Which key a stored version is encrypted under. Both null: the owner's account DEK. */
export interface VersionKey {
  keyScope: string | null;
  keyGen: number | null;
}

/** GET /api/keys/me. */
export interface UserKeyResponse {
  key: {
    publicJwk: DeviceJwk;
    fingerprint: string;
    privateWrapped: WrappedKey;
    pins: WrappedKey | null;
    createdAt: string;
  } | null;
}

/** One environment key and the generations a member can open. */
export interface EnvKeyInfo {
  id: string;
  projectId: string;
  environment: string;
  gen: number;
  /**
   * Every generation's chain link, and for admins its copy under the
   * workspace key (null for members, who open it through their grant).
   */
  gens: { gen: number; workspaceGen: number; adminWrapped: WrappedKey | null; prevWrapped: WrappedKey | null }[];
  /** Members: their grant, with the current generation wrapped to them. */
  grant?: { access: "read" | "write"; keyGen: number; wrap: PersonWrap };
}

/** GET /api/workspaces/:id/keys. */
export interface WorkspaceKeysResponse {
  /** The workspace key wrapped to the caller (owners and admins). */
  workspace: { gen: number; wrap: PersonWrap } | null;
  envKeys: EnvKeyInfo[];
  /**
   * Public keys of everyone who made a wrap above, by fingerprint, so the
   * client can open them. Check each against its fingerprint and the
   * caller's pins before trusting it.
   */
  senders: Record<string, DeviceJwk>;
  /**
   * Who each sender is and their role in this team now (null once they have
   * left). Absent from older servers.
   */
  senderInfo?: Record<string, { userId: string; role: "owner" | "admin" | "member" | null }>;
}

/** A member as GET /api/workspaces/:id/members lists them. */
export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member";
  preset: "admin" | "developer" | "read" | "custom";
  /** Null until they set up their sharing key. */
  fingerprint: string | null;
  /** Admins see each member's public key, to wrap keys to them in a rotation. */
  publicJwk?: DeviceJwk | null;
  /** Admins see each member's grants, and whether each has its wrap yet. */
  grants?: { projectId: string; environment: string; access: "read" | "write"; ready: boolean }[];
  /** Admins see whether an admin has the current workspace key. */
  ready?: boolean;
}

export interface TeamMembersResponse {
  role: "owner" | "admin" | "member";
  members: TeamMember[];
  /** Admins only: invites not yet accepted. */
  invites?: { id: string; email: string; role: "admin" | "member"; preset: string; expiresAt: string; createdAt: string }[];
}

/** Someone an admin's client can wrap a key to. */
export interface WrapTarget {
  userId: string;
  name: string;
  email: string;
  publicJwk: DeviceJwk;
  fingerprint: string;
}

/** GET /api/workspaces/:id/pending: what an admin's client should do now. */
export interface PendingWraps {
  workspaceGen: number;
  admins: WrapTarget[];
  grants: (WrapTarget & { projectId: string; environment: string; gen: number })[];
  rotationDue: { workspace: boolean; envKeys: { projectId: string; environment: string }[] };
}

/** Shape check for a WrappedKey from the wire. */
export function isWrappedKey(v: unknown): v is WrappedKey {
  if (typeof v !== "object" || v === null) return false;
  const w = v as Record<string, unknown>;
  return w.v === 1 && w.alg === "AES-GCM" && typeof w.nonce === "string" && typeof w.ciphertext === "string";
}

/** The full navigation tree for the signed-in user. */
export interface VaultTree {
  workspaces: WorkspaceNode[];
  /** False on a self-hosted server, where there are no teams. Absent from older servers. */
  teamsEnabled?: boolean;
}

/**
 * A personal access token as shown in the UI. Never includes the token itself —
 * that is returned exactly once, at creation, and only stored hashed.
 */
export interface AccessTokenSummary {
  id: string;
  name: string;
  /** First chars of the token's random body, to tell tokens apart in a list. */
  prefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/** A one-time send as its sender's list shows it. Never the blob. */
export interface SendSummary {
  id: string;
  createdAt: string;
  expiresAt: string;
  views: number;
  viewsLeft: number;
  /** The last time it was opened. */
  openedAt: string | null;
  /** True when the sender added a passphrase. */
  passphrase: boolean;
  state: "waiting" | "opened" | "expired" | "revoked";
}
