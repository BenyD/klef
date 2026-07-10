// SPDX-License-Identifier: AGPL-3.0-or-later
//
// App-level DTOs shared between the Worker API and the client. These describe
// navigation structure (plaintext names) — NOT the crypto contract (see
// types.ts / BLOB_FORMAT.md).

import type { WrappedKey } from "./types.ts";

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
  projects: ProjectNode[];
}

/** The full navigation tree for the signed-in user. */
export interface VaultTree {
  workspaces: WorkspaceNode[];
}
