-- Optional framework per project; drives default env-file names in the UI.
-- Plaintext like names (see 0003). Validated in the API rather than a CHECK so
-- adding a framework later doesn't need a migration.
ALTER TABLE projects ADD COLUMN framework TEXT;
