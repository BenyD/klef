-- Browser-based CLI sign-in (OAuth device authorization, RFC 8628 in shape).
--
-- `klef login` starts a request here, opens the browser, and polls. The user
-- approves it on a page that requires a real session, and the CLI collects the
-- token it minted. No token ever passes through a clipboard, which is the
-- failure mode the paste flow had.
--
-- The device code is the CLI's secret and only its SHA-256 is stored, the same
-- rule as access_tokens. The user code is short and human-readable because it
-- has to be compared by eye: the terminal prints it and the approval page
-- shows it, and they must match before anyone clicks approve. That comparison
-- is what stops someone getting their own code approved by a stranger.
--
-- The CLI sends a public key when it starts. `token_sealed` holds the minted
-- access token sealed to that key, so between approval and collection the row
-- is not a usable credential to anyone reading the database - including the
-- server, which never has the private half. That is the same property the
-- vault itself has, applied to the one place a device flow would otherwise
-- park a live token in the clear.

CREATE TABLE device_authorizations (
  id           TEXT PRIMARY KEY,
  device_hash  TEXT NOT NULL UNIQUE,  -- base64 SHA-256 of the device code
  user_code    TEXT NOT NULL UNIQUE,  -- e.g. WDJB-MJHT, compared by eye
  label        TEXT NOT NULL,         -- what the approval page names, e.g. "macOS"
  public_jwk   TEXT NOT NULL,         -- the CLI's ECDH public key, JSON
  user_id      TEXT REFERENCES user(id) ON DELETE CASCADE,  -- null until approved
  approved_at  TEXT,
  denied_at    TEXT,
  token_sealed TEXT,                  -- JSON SealedToken, openable only by the CLI
  collected_at TEXT,                  -- set on first poll after approval; single use
  expires_at   TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE INDEX device_authorizations_user_code_idx ON device_authorizations (user_code);
CREATE INDEX device_authorizations_expires_idx ON device_authorizations (expires_at);
