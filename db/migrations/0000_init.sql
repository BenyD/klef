-- Phase 0 — prove the D1 binding + migrations tooling end to end.
-- Real schema (accounts/vault, workspaces, projects, env_files, env_versions)
-- arrives in Phase 1 (Better Auth) and Phase 4 (structure).

CREATE TABLE IF NOT EXISTS health_check (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
