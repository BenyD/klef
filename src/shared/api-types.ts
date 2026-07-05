// SPDX-License-Identifier: AGPL-3.0-or-later
//
// App-level DTOs shared between the Worker API and the client. These describe
// navigation structure (plaintext names) — NOT the crypto contract (see
// types.ts / BLOB_FORMAT.md).

/** Fixed environment labels a file can be tagged with (Vercel-style). */
export const ENVIRONMENTS = ["development", "preview", "production"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

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
  createdAt: string;
  files: EnvFileNode[];
}

export interface WorkspaceNode {
  id: string;
  name: string;
  createdAt: string;
  projects: ProjectNode[];
}

/** The full navigation tree for the signed-in user. */
export interface VaultTree {
  workspaces: WorkspaceNode[];
}
