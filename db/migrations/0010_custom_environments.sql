-- Environment labels become free-form (custom environments like "staging" or
-- "qa"). SQLite cannot drop the fixed-set CHECK from 0005, so rebuild the
-- table; validation now lives app-side (normalizeEnvironment in api-types).
-- FK checks are deferred so env_versions rows survive the parent swap.
PRAGMA defer_foreign_keys = true;

CREATE TABLE env_files_new (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  current_version_id TEXT, -- nullable until the first save (Phase 5)
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  environment        TEXT
);

INSERT INTO env_files_new (id, project_id, name, current_version_id, created_at, environment)
  SELECT id, project_id, name, current_version_id, created_at, environment FROM env_files;

DROP TABLE env_files;
ALTER TABLE env_files_new RENAME TO env_files;
CREATE INDEX IF NOT EXISTS env_files_project_idx ON env_files (project_id);
