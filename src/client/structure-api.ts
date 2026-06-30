import type { VaultTree } from "../shared/api-types.ts";

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
export const renameWorkspace = (id: string, name: string) =>
  req(`/api/workspaces/${id}`, jsonBody("PATCH", { name }));
export const deleteWorkspace = (id: string) =>
  req(`/api/workspaces/${id}`, { method: "DELETE" });

export const createProject = (workspaceId: string, name: string) =>
  req<{ id: string }>("/api/projects", jsonBody("POST", { workspaceId, name }));
export const renameProject = (id: string, name: string) =>
  req(`/api/projects/${id}`, jsonBody("PATCH", { name }));
export const deleteProject = (id: string) =>
  req(`/api/projects/${id}`, { method: "DELETE" });

export const createFile = (projectId: string, name: string) =>
  req<{ id: string }>("/api/files", jsonBody("POST", { projectId, name }));
export const renameFile = (id: string, name: string) =>
  req(`/api/files/${id}`, jsonBody("PATCH", { name }));
export const deleteFile = (id: string) =>
  req(`/api/files/${id}`, { method: "DELETE" });
