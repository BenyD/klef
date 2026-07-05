-- Optional environment label per env file. Plaintext like names (see 0003) —
-- a label leaks nothing a file name like ".env.production" doesn't already.
ALTER TABLE env_files ADD COLUMN environment TEXT
  CHECK (environment IS NULL OR environment IN ('development', 'preview', 'production'));
