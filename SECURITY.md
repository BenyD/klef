# Security Policy

Klef is a zero-knowledge secrets tool, so its security properties are the whole
point. Reports of vulnerabilities are very welcome.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Instead, use
GitHub's [private vulnerability reporting](https://github.com/) ("Report a
vulnerability" under the repository's Security tab), or email the maintainer.

Include enough detail to reproduce: affected version/commit, the scenario, and
the impact. You'll get an acknowledgement as quickly as possible.

## What Klef protects

Klef encrypts every env value in your browser. The server stores only
ciphertext, salts, nonces, and KDF parameters — none of which reveal a secret.
See [the crypto contract](src/shared/BLOB_FORMAT.md) for the full design.

**In scope:** anything that would let the server, operator, host, or a network
attacker read plaintext secrets or key material; weaknesses in the KDF/envelope/
AES-GCM usage; auth bypass; cross-user data access; XSS or supply-chain issues
that could exfiltrate keys from the browser.

## What Klef does not defend against (by design)

- A compromised client device — keylogger, malicious browser extension, or
  malware that reads browser memory while the vault is unlocked.
- A weak passphrase brute-forced offline against the wrapped DEK.
- Loss of **both** the passphrase and the recovery key — data is then
  permanently unrecoverable, which is what zero-knowledge means.

## Handling rules the code follows

- Encryption keys exist only in browser memory during an unlocked session.
- No key material, passphrase, or plaintext is ever sent to the server or logged.
- Locking clears keys from memory.
- Key material is imported as non-extractable `CryptoKey` objects where the flow
  allows.
