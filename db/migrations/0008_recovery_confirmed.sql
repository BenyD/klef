-- Recovery-key nudge: when the user last confirmed having their recovery key
-- saved (the setup checkbox, or a rotation). NULL means never confirmed, and
-- the app shows a banner urging them to save one.
ALTER TABLE vault ADD COLUMN recovery_confirmed_at TEXT;
