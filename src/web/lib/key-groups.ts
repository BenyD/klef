// The key finder's model: every key name across the vault, grouped by project,
// with the files in each project that are missing it. Pure and headless (no
// DOM, no crypto): the dialog decrypts files, reads their key names, and hands
// them here. Values never enter this module.

import { searchItems } from "./palette-search.ts";

/** A dotenv file whose key names are known. */
export interface KeyedFile {
  fileId: string;
  fileName: string;
  projectId: string;
  project: string;
  workspaceId: string;
  workspace: string;
  environment: string | null;
  keys: readonly string[];
}

export type FileRef = Pick<KeyedFile, "fileId" | "fileName" | "environment">;

/** One project's view of a key: which files set it, which don't. */
export interface ProjectPresence {
  projectId: string;
  project: string;
  workspaceId: string;
  workspace: string;
  present: FileRef[];
  /**
   * Files in the same project that set other keys but not this one: the
   * "in .env.local but not .env.production" drift worth fixing.
   */
  missing: FileRef[];
}

export interface KeyGroup {
  key: string;
  /** Files that set the key, across every project. */
  fileCount: number;
  projects: ProjectPresence[];
  /** Total missing files across projects; 0 means consistent everywhere. */
  gaps: number;
}

export interface KeyFilter {
  query?: string;
  /** Only this workspace's projects. */
  workspaceId?: string | null;
  /** Only files labelled with this environment. */
  environment?: string | null;
  /** Only keys missing from at least one file in a project that uses them. */
  gapsOnly?: boolean;
}

export interface RankedKeyGroup {
  group: KeyGroup;
  /** Matched character indices in the key name. */
  highlight: number[];
}

function ref(f: KeyedFile): FileRef {
  return { fileId: f.fileId, fileName: f.fileName, environment: f.environment };
}

// Files read in a stable order inside a project: by name, so `.env` sits
// before `.env.local` before `.env.production` wherever it appears.
const byName = (a: FileRef, b: FileRef) => a.fileName.localeCompare(b.fileName);

/**
 * Groups the files' key names by key, then by project. A project only shows
 * under a key if at least one of its files sets it; its other files are the
 * key's `missing` list there. Keys come back alphabetically.
 */
export function groupKeys(files: readonly KeyedFile[]): KeyGroup[] {
  const projectFiles = new Map<string, KeyedFile[]>();
  for (const f of files) {
    const list = projectFiles.get(f.projectId);
    if (list) list.push(f);
    else projectFiles.set(f.projectId, [f]);
  }

  const keyProjects = new Map<string, Map<string, KeyedFile[]>>();
  for (const f of files) {
    for (const key of new Set(f.keys)) {
      let projects = keyProjects.get(key);
      if (!projects) keyProjects.set(key, (projects = new Map()));
      const list = projects.get(f.projectId);
      if (list) list.push(f);
      else projects.set(f.projectId, [f]);
    }
  }

  const groups: KeyGroup[] = [];
  for (const [key, projects] of keyProjects) {
    const presences: ProjectPresence[] = [];
    for (const [projectId, setting] of projects) {
      const first = setting[0] as KeyedFile;
      const has = new Set(setting.map((f) => f.fileId));
      presences.push({
        projectId,
        project: first.project,
        workspaceId: first.workspaceId,
        workspace: first.workspace,
        present: setting.map(ref).sort(byName),
        missing: (projectFiles.get(projectId) ?? [])
          .filter((f) => !has.has(f.fileId))
          .map(ref)
          .sort(byName),
      });
    }
    presences.sort(
      (a, b) =>
        a.workspace.localeCompare(b.workspace) ||
        a.project.localeCompare(b.project),
    );
    groups.push({
      key,
      fileCount: presences.reduce((n, p) => n + p.present.length, 0),
      projects: presences,
      gaps: presences.reduce((n, p) => n + p.missing.length, 0),
    });
  }
  return groups.sort((a, b) => a.key.localeCompare(b.key));
}

/** Narrows one group to a workspace and/or environment; null if nothing is left. */
function narrow(group: KeyGroup, filter: KeyFilter): KeyGroup | null {
  const env = filter.environment ?? null;
  const projects = group.projects
    .filter((p) => !filter.workspaceId || p.workspaceId === filter.workspaceId)
    .map((p) =>
      env
        ? {
            ...p,
            present: p.present.filter((f) => f.environment === env),
            missing: p.missing.filter((f) => f.environment === env),
          }
        : p,
    )
    .filter((p) => p.present.length > 0 || (env !== null && p.missing.length > 0))
    // The gaps view is about what to fix: projects with nothing missing are
    // noise there.
    .filter((p) => !filter.gapsOnly || p.missing.length > 0);
  if (projects.length === 0) return null;
  const narrowed = {
    ...group,
    projects,
    fileCount: projects.reduce((n, p) => n + p.present.length, 0),
    gaps: projects.reduce((n, p) => n + p.missing.length, 0),
  };
  // With an environment picked, a key that no file of that environment sets
  // is only interesting as a gap.
  if (narrowed.fileCount === 0 && !filter.gapsOnly) return null;
  return narrowed;
}

/**
 * Applies the filters, then ranks by the fuzzy matcher on the key name. With
 * no query, keys stay alphabetical, except in the gaps view, where the keys
 * missing from the most files lead.
 */
export function filterKeyGroups(
  groups: readonly KeyGroup[],
  filter: KeyFilter,
): RankedKeyGroup[] {
  const kept = groups
    .map((g) => narrow(g, filter))
    .filter((g): g is KeyGroup => g !== null)
    .filter((g) => !filter.gapsOnly || g.gaps > 0);

  const query = filter.query?.trim() ?? "";
  if (query === "") {
    const ordered = filter.gapsOnly
      ? [...kept].sort((a, b) => b.gaps - a.gaps || a.key.localeCompare(b.key))
      : kept;
    return ordered.map((group) => ({ group, highlight: [] }));
  }
  return searchItems(
    kept.map((group) => ({ id: group.key, fields: [{ text: group.key }], group })),
    query,
  ).map((r) => ({ group: r.item.group, highlight: r.highlights[0] ?? [] }));
}
