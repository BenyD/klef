-- Phase 3 — per-user vault key material. Keyed to the Better Auth `user` row
-- rather than extending it, so auth and crypto stay cleanly separated.
-- Every column is opaque to the server: it can store and return these blobs but
-- cannot decrypt anything without the passphrase or recovery key.

CREATE TABLE IF NOT EXISTS vault (
  user_id              TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  kdf_params           TEXT NOT NULL, -- JSON KdfParams (algorithm + params + salt)
  wrapped_dek          TEXT NOT NULL, -- JSON WrappedKey (DEK under passphrase KEK)
  wrapped_dek_recovery TEXT NOT NULL, -- JSON WrappedKey (DEK under recovery key)
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
