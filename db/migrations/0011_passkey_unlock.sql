-- Per-passkey DEK wraps for WebAuthn PRF unlock. Each row is the DEK wrapped
-- under a key derived from that passkey's PRF secret. Keyed to Better Auth's
-- passkey row so deleting a passkey deletes its unlock wrap with it. The salt
-- is the PRF eval input (not secret, like a KDF salt).
CREATE TABLE vault_passkey (
  passkey_id    TEXT PRIMARY KEY REFERENCES passkey(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  prf_salt      TEXT NOT NULL,
  wrapped_dek   TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX vault_passkey_user_idx ON vault_passkey (user_id);
