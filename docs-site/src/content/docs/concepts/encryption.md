---
title: End-to-end encryption
description: What is encrypted, where, with which algorithms, and why signing in is not the same as unlocking.
sidebar:
  order: 3
---

Klef is zero-knowledge: the server stores your files only as ciphertext and never receives anything that could decrypt them. Encryption and decryption happen on your device, in the browser or in the CLI, using the same code ([`src/shared/crypto.ts`](https://github.com/BenyD/klef/blob/main/src/shared/crypto.ts)).

## Auth is not unlock

Klef has two separate gates.

| Gate | Proves | With | Gets you |
| --- | --- | --- | --- |
| **Sign in** | Who you are | Google, GitHub or a passkey (browser); an access token (CLI) | Ciphertext, and the plaintext names of workspaces, projects and files |
| **Unlock** | That you hold the key | Your master passphrase, an unlock passkey, or the recovery key | The decrypted contents |

A signed-in but locked app sees only ciphertext. Locking the vault, by hand, with <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> or on the auto-lock timer, forgets the key without signing you out. Signing in never needs the passphrase, and the passphrase never goes to the server.

## Envelope encryption

Your files are not encrypted directly with your passphrase.

1. When you create the vault, your browser generates a random 256-bit **data encryption key** (DEK). Every file version is encrypted with it.
2. Your passphrase is stretched into a **key encryption key** (KEK). The KEK only ever encrypts the DEK.
3. The server stores the DEK **wrapped** (encrypted) under the KEK.
4. It also stores a second copy of the DEK, wrapped under a key derived from your **recovery key**.

Changing your passphrase re-wraps the DEK, one small operation. None of your files are re-encrypted.

## The algorithms

| Purpose | Algorithm | Parameters |
| --- | --- | --- |
| Passphrase to KEK | Argon2id | 19 MiB memory, 2 passes, parallelism 1, 16-byte random salt per account, 32-byte output |
| Fallback where WebAssembly is unavailable | PBKDF2-HMAC-SHA-256 | 600,000 iterations, 32-byte output |
| Recovery key to its wrapping key | HKDF-SHA-256 | Info `klef/recovery-kek/v1`. The recovery key is already 128 random bits, so it needs no slow KDF. |
| Files and wrapped keys | AES-256-GCM | A fresh random 96-bit nonce for every encryption, 128-bit tag |

The KDF and its parameters are stored with your account, so the cost can be raised later without re-encrypting your files. Keys are held as non-extractable WebCrypto keys wherever the flow allows: code can ask them to encrypt or decrypt, but cannot read their bytes.

## What the server stores

| Data | Readable by the server? |
| --- | --- |
| Workspace, project and file names | Yes, by design, so it can list them |
| Environment labels | Yes |
| KDF parameters, salts, nonces | Yes, and none of them is secret |
| Wrapped DEK (passphrase and recovery copies) | No, it needs your passphrase or recovery key |
| File contents, every version | No, they need the DEK |

Every stored blob carries a format version, so algorithms can change in future without breaking existing data. The full wire format is specified in [`BLOB_FORMAT.md`](https://github.com/BenyD/klef/blob/main/src/shared/BLOB_FORMAT.md), written so that it could be reimplemented in another language.

## The stored text is exactly what you saved

The plaintext Klef encrypts is the raw text of your env file, byte for byte. It does not parse your file into keys and values and re-serialise it, so comments, order, blank lines, quoting and multiline values all come back exactly as they went in.

## Next

- [Passphrase, passkeys and recovery key](/docs/concepts/unlocking/)
- [Security model](/docs/security/), including what Klef does not protect against
