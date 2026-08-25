-- Personal access tokens: the "auth" gate for non-browser clients (CLI, MCP
-- server). Deliberately parallel to Better Auth's `session` table — a token
-- proves *who*, exactly like a session cookie does, and nothing more.
--
-- A stolen token yields ciphertext and plaintext names, never secret values:
-- the unlock gate is the passphrase-derived key, which lives only on the
-- client and is not reachable from here. See docs/AGENT_ACCESS.md.
--
-- Only the SHA-256 of each token is stored. Plain SHA-256 (not Argon2id) is
-- correct for a 256-bit uniformly random secret: there is no dictionary to
-- attack, and a slow KDF would tax every authenticated request.
--
-- Timestamps are ISO 8601 strings written by the application, not
-- `datetime('now')`, so every column in this table compares consistently.

CREATE TABLE access_tokens (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,        -- human label: "laptop cli", "claude code"
  token_hash   TEXT NOT NULL UNIQUE, -- base64 SHA-256 of the full token
  prefix       TEXT NOT NULL,        -- first chars of the random body, for display
  last_used_at TEXT,                 -- ISO 8601; throttled, not exact
  expires_at   TEXT,                 -- ISO 8601; NULL = never expires
  created_at   TEXT NOT NULL
);

CREATE INDEX access_tokens_user_idx ON access_tokens (user_id);
