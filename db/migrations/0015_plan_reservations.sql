-- Plan reservations: a signed-in person saying "I would pay for this"
-- before the one-time plans open: Hosted on klef.sh, or the self-host kit. Nothing is charged; a row is intent, not a
-- subscription. One row per user, cascading with the account like every
-- other table (see src/api/account-wipe.test.ts).
--
-- created_at is kept when the plan changes, so the early price goes by when
-- someone first reserved, not when they last switched.

CREATE TABLE plan_reservations (
  user_id    TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  plan       TEXT NOT NULL CHECK (plan IN ('hosted', 'kit')),
  created_at TEXT NOT NULL,  -- ISO 8601, written by the application
  updated_at TEXT NOT NULL   -- ISO 8601
);
