import type { Environment, Framework, VaultTree } from "../shared/api-types.ts";
import type { EncryptedBlob } from "../shared/types.ts";

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

const jsonBody = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const getTree = () => req<VaultTree>("/api/tree");

export const createWorkspace = (name: string) =>
  req<{ id: string }>("/api/workspaces", jsonBody("POST", { name }));
export const updateWorkspace = (
  id: string,
  fields: { name?: string; icon?: string | null },
) => req(`/api/workspaces/${id}`, jsonBody("PATCH", fields));
export const renameWorkspace = (id: string, name: string) =>
  updateWorkspace(id, { name });
export const deleteWorkspace = (id: string) =>
  req(`/api/workspaces/${id}`, { method: "DELETE" });

export const createProject = (
  workspaceId: string,
  name: string,
  framework: Framework | null = null,
  icon: string | null = null,
) =>
  req<{ id: string }>(
    "/api/projects",
    jsonBody("POST", { workspaceId, name, framework, icon }),
  );
export const updateProject = (
  id: string,
  fields: { name?: string; framework?: Framework | null; icon?: string | null },
) => req(`/api/projects/${id}`, jsonBody("PATCH", fields));
export const deleteProject = (id: string) =>
  req(`/api/projects/${id}`, { method: "DELETE" });

export const createFile = (
  projectId: string,
  name: string,
  environment: Environment | null = null,
) =>
  req<{ id: string }>(
    "/api/files",
    jsonBody("POST", { projectId, name, environment }),
  );
export const renameFile = (id: string, name: string) =>
  req(`/api/files/${id}`, jsonBody("PATCH", { name }));
export const setFileEnvironment = (id: string, environment: Environment | null) =>
  req(`/api/files/${id}`, jsonBody("PATCH", { environment }));
export const deleteFile = (id: string) =>
  req(`/api/files/${id}`, { method: "DELETE" });

export interface CurrentVersion {
  id: string;
  blob: EncryptedBlob;
  createdAt: string;
}

export const getCurrentVersion = (fileId: string) =>
  req<{ version: CurrentVersion | null }>(`/api/files/${fileId}/current`);

export const saveVersion = (fileId: string, blob: EncryptedBlob) =>
  req<{ id: string; createdAt: string }>(
    `/api/files/${fileId}/versions`,
    jsonBody("POST", { blob }),
  );

export interface VersionSummary {
  id: string;
  createdAt: string;
  isCurrent: boolean;
}

export const listVersions = (fileId: string) =>
  req<{ versions: VersionSummary[] }>(`/api/files/${fileId}/versions`);

export const getVersion = (fileId: string, versionId: string) =>
  req<{ version: CurrentVersion }>(`/api/files/${fileId}/versions/${versionId}`);
