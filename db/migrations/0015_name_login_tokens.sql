-- Tokens minted by `klef login` were named after the one-time code the user
-- typed ("CLI (RG4R-9WNK)"), which means nothing once the login is done. They
-- are named after the machine now; give existing ones the same treatment.
--
-- A login's token is minted in the same statement batch that approves it, so
-- its created_at equals the authorization's approved_at. The OS and hostname
-- tidying mirrors src/cli/machine-label.ts for the common cases.

UPDATE access_tokens
SET name = COALESCE(
  (
    SELECT REPLACE(REPLACE(REPLACE(REPLACE(d.label,
      'Darwin on ', 'macOS on '),
      'Windows_NT on ', 'Windows on '),
      '.local', ''),
      '.lan', '')
    FROM device_authorizations d
    WHERE d.user_id = access_tokens.user_id
      AND d.approved_at = access_tokens.created_at
      AND d.label <> 'a terminal'
    LIMIT 1
  ),
  'CLI login'
)
-- "CLI (XXXX-XXXX)" exactly. D1 caps pattern length, so no character classes.
WHERE name LIKE 'CLI (____-____)';
