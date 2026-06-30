// SPDX-License-Identifier: AGPL-3.0-or-later
//
// App-level DTOs shared between the Worker API and the client. These describe
// navigation structure (plaintext names) — NOT the crypto contract (see
// types.ts / BLOB_FORMAT.md).

export interface EnvFileNode {
  id: string;
  name: string;
  /** Null until the file's first save (Phase 5). */
  currentVersionId: string | null;
  createdAt: string;
}

export interface ProjectNode {
  id: string;
  name: string;
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
