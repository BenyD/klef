-- Phase 4 — navigation structure. Names are PLAINTEXT (for navigation); only
-- env *contents* (Phase 5, env_versions) are ever encrypted. Everything cascades
-- from the owning user so deleting an account removes all of its structure.

CREATE TABLE IF NOT EXISTS workspaces (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS workspaces_user_idx ON workspaces (user_id);

CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS projects_workspace_idx ON projects (workspace_id);

CREATE TABLE IF NOT EXISTS env_files (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  current_version_id TEXT, -- nullable until the first save (Phase 5)
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS env_files_project_idx ON env_files (project_id);
