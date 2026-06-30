-- Phase 5 — encrypted env file versions. Every save inserts a new row; the
-- file's current_version_id points at the latest. This gives version history
-- and restore for free (Phase 6). `blob` is the full EncryptedBlob JSON and is
-- completely opaque to the server.

CREATE TABLE IF NOT EXISTS env_versions (
  id          TEXT PRIMARY KEY,
  env_file_id TEXT NOT NULL REFERENCES env_files(id) ON DELETE CASCADE,
  blob        TEXT NOT NULL, -- JSON EncryptedBlob { v, alg, nonce, ciphertext }
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS env_versions_file_idx ON env_versions (env_file_id);
