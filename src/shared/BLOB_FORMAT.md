# Klef crypto contract

> Canonical, versioned specification for how Klef encrypts data. Written so it
> can be reimplemented in another language (e.g. a future Go CLI) and remain
> wire-compatible. The TypeScript reference lives in `constants.ts` / `types.ts`
> and (from Phase 2) `crypto.ts`.

## Design goals

- **Zero-knowledge.** The server only ever sees ciphertext, salts, nonces, and
  KDF parameters. None of those reveal any secret value.
- **Names plaintext, values encrypted.** Only env *contents* are encrypted.
- **The blob is source of truth.** Plaintext is the raw pasted env text,
  byte-for-byte (comments, ordering, blank lines, multiline values preserved).
  Key/value parsing is for display only and never the stored form.
- **Versioned.** Every blob carries `v`. Parameters can change without breaking
  existing data.

## Envelope encryption (DEK / KEK)

Blobs are **not** encrypted directly with the passphrase-derived key.

1. **DEK** (Data Encryption Key): 32 random bytes, generated once per account.
   Every env blob is encrypted with the DEK.
2. **KEK** (Key Encryption Key): derived from the master passphrase via the KDF.
   Used only to wrap the DEK.
3. The server stores the **wrapped DEK** (DEK encrypted under the KEK).
4. The server also stores a **second wrapped DEK**: the DEK encrypted under a
   key derived from the **recovery key**.

Changing the passphrase only re-wraps the DEK (one tiny operation), never the
blobs. The same shape extends to per-workspace DEKs later.

## Key derivation (KDF)

Preferred: **Argon2id** (`m = 19456 KiB`, `t = 2`, `p = 1`, 32-byte output,
16-byte random salt). Run in a Web Worker; tune `t` upward toward a ~250–500 ms
unlock as hardware allows.

Fallback (no WASM): **PBKDF2-HMAC-SHA-256**, 600 000 iterations, 32-byte output.

The KDF `id` and parameters are stored per account in `kdf_params` so the cost
can be raised, or the algorithm swapped, without re-encrypting anything but the
wrapped DEK.

## Symmetric encryption

**AES-256-GCM** via WebCrypto. A fresh **12-byte (96-bit)** nonce is generated
with a CSPRNG for every encryption and stored alongside the ciphertext. An
`(IV, key)` pair is **never** reused. The 128-bit GCM auth tag is appended to
the ciphertext by WebCrypto.

### Wrapping vs. encrypting

Klef wraps the DEK by **encrypting its raw 32 bytes** with the KEK using
`subtle.encrypt` (AES-GCM) — it does **not** use `subtle.wrapKey`. `wrapKey`
requires the wrapped key to be `extractable`; encrypting raw bytes lets both KEK
and DEK be imported as **non-extractable** `CryptoKey` objects.

## Recovery key

128 bits of CSPRNG entropy, encoded as **Crockford Base32** (excludes
`I L O U`, case-insensitive on input), displayed in dash-separated groups with a
`KLEF-` prefix, e.g. `KLEF-AB3C4-9XK2M-...`. Shown **exactly once** at vault
setup with explicit "I have saved this" confirmation; it cannot be recovered.

The recovery key is already high-entropy (128 random bits), so it does **not**
go through the slow passphrase KDF. The wrapping key is derived with
**HKDF-SHA-256** (`salt = empty`, `info = "klef/recovery-kek/v1"`, 32-byte
output → AES-256-GCM). That key wraps the DEK to produce the second wrapped DEK,
so a forgotten passphrase can still be recovered while the data stays
zero-knowledge.

## Wire formats

### Encrypted blob (`env_versions.ciphertext`)

```jsonc
{
  "v": 1,
  "alg": "AES-GCM",
  "nonce": "<base64, 12 bytes>",
  "ciphertext": "<base64, raw pasted env text + GCM tag>"
}
```

### Wrapped key (stored on the account)

Same shape as a blob; the plaintext is the 32-byte DEK rather than env text.

### KDF params (`accounts.kdf_params`, JSON)

```jsonc
// Argon2id
{ "id": "argon2id", "memoryKiB": 19456, "iterations": 2, "parallelism": 1,
  "hashLengthBytes": 32, "salt": "<base64, 16 bytes>" }

// PBKDF2 fallback
{ "id": "pbkdf2-sha256", "hash": "SHA-256", "iterations": 600000,
  "hashLengthBytes": 32, "salt": "<base64, 16 bytes>" }
```

## User keys, team keys and sends

Added for team workspaces and one-time sends (design:
`docs/SHARING_DESIGN.md`). **Env blobs do not change**: a team's blobs are the
same `v: 1` `EncryptedBlob`, encrypted with `encryptBlob` under a different
32-byte key, which the row names beside the blob (`env_versions.key_scope`,
`key_gen`; both empty means the owner's account DEK).

### Key objects with context (`aead.ts`)

Every small key object below is the `WrappedKey` shape, AES-256-GCM with a
fresh 12-byte nonce, and **additional data** naming what it is for: UTF-8 of
the purpose string and its context parts joined by `\n` (no part may contain a
newline). Opening it in any other context fails.

### User keypair (`user-key.ts`)

- P-256 ECDH. Public key served as JWK `{ kty: "EC", crv: "P-256", x, y }`.
- Fingerprint: hex of the first 16 bytes of
  `SHA-256(utf8("klef/user-key/v1\n" + crv + "\n" + x + "\n" + y))`.
  Displayed as Crockford Base32 of its first 10 bytes in four groups of four.
- Private key: PKCS8 bytes sealed under the account DEK, context
  `klef/user-key/v1`, `userId`, `fingerprint`.
- Pins: UTF-8 JSON `{ userId: fingerprint }` sealed under the DEK, context
  `klef/user-pins/v1`, `userId`.

### Wrapping a key to a person (`team-keys.ts`)

An authenticated ephemeral-static seal (the shape of HPKE `mode_auth`). With
granter `S`, recipient `R` and a fresh ephemeral keypair `E`:

```
ikm  = ECDH(E.priv, R.pub) || ECDH(S.priv, R.pub)      // 32 + 32 bytes
k    = HKDF-SHA-256(ikm, salt = empty, info = purpose) // AES-256-GCM key
aad  = purpose \n scope... \n gen \n fpr(S) \n fpr(R)
```

The recipient computes `ECDH(R.priv, E.pub) || ECDH(R.priv, S.pub)`.

| Purpose | Scope parts | Wraps |
|---|---|---|
| `klef/workspace-key/v1` | workspaceId | The workspace key, to the owner and each admin |
| `klef/env-key/v1` | workspaceId, projectId, environment | An environment key, to a granted member |

Environment is the file's label, `""` for unlabelled files.

```jsonc
{ "v": 1, "alg": "P256-AUTH+HKDF-SHA256+AES-GCM", "gen": 3,
  "sender": "<fingerprint hex of S>",
  "ephemeralPublicJwk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." },
  "nonce": "<base64, 12 bytes>", "ciphertext": "<base64, 32-byte key + tag>" }
```

### Environment keys under the workspace key, and chains

- Admin copy: the environment key sealed under workspace key generation `w`,
  context `klef/env-key-admin/v1`, workspaceId, projectId, environment, `gen`,
  `w`.
- Chain link stored with generation `g`: generation `g - 1` sealed under
  generation `g`, context `klef/env-key-chain/v1`, projectId, environment, `g`.
  It names no workspace, so it survives a project moving between teams.

### Sends (`send.ts`)

```
k    = 32 random bytes, base64url in the URL fragment only
id   = 16 random bytes, base64url, chosen by the client
k'   = HKDF-SHA-256(k, salt = empty, info = "klef/send/v1")
       or, with a passphrase p and stored KdfParams:
       HKDF-SHA-256(k || KDF(p), salt = empty, info = "klef/send/v1/passphrase")
pt   = uint32be(len(utf8(text))) || utf8(text), zero-padded to the first of
       256, 1024, 4096, 16384, 65536 bytes that fits
blob = WrappedKey shape, AES-256-GCM(k', pt), context "klef/send/v1", id
```

## What the server can and cannot do

| Server sees | Server can read? |
|---|---|
| Workspace / project / file names | Yes (plaintext, for navigation) |
| `kdf_params`, salts, nonces | Yes (not secret) |
| `wrapped_dek`, `wrapped_dek_recovery` | No (needs passphrase/recovery key) |
| `env_versions.ciphertext` | No (needs the DEK, or the environment key) |
| User public keys, fingerprints, send ids | Yes (not secret) |
| User private keys, pins | No (sealed under the DEK) |
| Workspace and environment key wraps, chain links | No (need a member's private key or a key above them) |
| Send blobs | No (the key is only in the link's fragment) |

## Versioning rules

- Any change to algorithms, KDF defaults, or blob shape **must** bump
  `BLOB_FORMAT_VERSION` and remain able to read older `v` values.
- Decryptors switch on `v`; encryptors always write the current version.
