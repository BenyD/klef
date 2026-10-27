-- The vault key, sealed to the CLI at sign-in, beside the sealed token.
--
-- When the person approving `klef login` in the browser also chooses to unlock
-- the CLI, the page recovers the DEK there (passkey or passphrase), seals it
-- to the same ECDH public key the token is sealed to, and sends only the
-- sealed blob. Like `token_sealed`, it is opaque to anyone reading the
-- database, the server included: opening it takes the CLI's private key,
-- which never left the CLI. It is bound to the user code, the approving user
-- and that public key, handed over once on the collecting poll and cleared in
-- the same update, and wiped with the row's token when the request expires.

ALTER TABLE device_authorizations ADD COLUMN vault_key_sealed TEXT;
