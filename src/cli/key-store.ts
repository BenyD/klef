// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Remembering the vault key on this device, so pull, push and sync never ask
// for the passphrase again after one unlock (or after a `klef login` the
// browser unlocked).
//
// Where it lives mirrors the access token: the OS keychain, or a 0600 file in
// the config directory where there is no usable keychain. What is stored is
// the raw DEK, scoped to one server and one vault, and it is imported as a
// non-extractable CryptoKey each time it is used, so the process that uses it
// cannot read it back out.
//
// The trade-off, written up in SECURITY.md: anyone who can run commands as
// this user on this machine can decrypt the vault, the same reach they have
// over the .env files `pull` already wrote here. A leaked token, or the
// server's whole database, still decrypts nothing.
//
// The vault is recognised by a fingerprint of its recovery wrapping, which a
// passphrase change leaves alone (the DEK stays the same) and a new vault
// replaces. A key whose fingerprint no longer matches is ignored and the CLI
// falls back to the passphrase; one that fails to decrypt is forgotten.

import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { base64ToBytes, bytesToBase64, type Bytes } from "../shared/encoding.ts";
import { importAesKey } from "../shared/crypto.ts";
import type { VaultKeyMaterial } from "../shared/types.ts";
import { vaultFingerprint } from "./agent-protocol.ts";
import { apiBaseUrl, configDir } from "./paths.ts";

const SERVICE = "klef";

interface KeyringEntry {
  getPassword(): string | null;
  setPassword(password: string): void;
  deletePassword(): boolean;
}

interface StoredKey {
  v: 1;
  server: string;
  /** vaultFingerprint of the recovery wrapping: which vault this key opens. */
  vault: string;
  /** The raw DEK, base64. */
  key: string;
}

export type KeySource = "keychain" | "file";

/** One entry per server: signing in to a second account on it replaces the first. */
function account(env: NodeJS.ProcessEnv): string {
  return `vault-key:${apiBaseUrl(env)}`;
}

function keyFile(env: NodeJS.ProcessEnv): string {
  return path.join(configDir(env, homedir()), "vault-key.json");
}

async function keyringEntry(env: NodeJS.ProcessEnv): Promise<KeyringEntry | null> {
  // KLEF_NO_KEYCHAIN for people who would rather not, and VITEST so a test
  // run can never put a key in a real keychain whatever env it passes.
  if (env.KLEF_NO_KEYCHAIN || process.env.VITEST) return null;
  try {
    const mod = (await import("@napi-rs/keyring")) as {
      Entry: new (service: string, account: string) => KeyringEntry;
    };
    return new mod.Entry(SERVICE, account(env));
  } catch {
    return null;
  }
}

/** Whether to remember at all: on unless turned off with `login --no-remember`, config or env. */
export async function rememberEnabled(env: NodeJS.ProcessEnv): Promise<boolean> {
  if (env.KLEF_NO_REMEMBER && env.KLEF_NO_REMEMBER !== "0") return false;
  return (await readSettings(env)).rememberKey !== false;
}

interface Settings {
  rememberKey?: boolean;
}

function settingsFile(env: NodeJS.ProcessEnv): string {
  return path.join(configDir(env, homedir()), "config.json");
}

export async function readSettings(env: NodeJS.ProcessEnv): Promise<Settings> {
  try {
    const parsed = JSON.parse(await readFile(settingsFile(env), "utf8")) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Settings) : {};
  } catch {
    return {};
  }
}

export async function writeSettings(env: NodeJS.ProcessEnv, patch: Settings): Promise<void> {
  const next = { ...(await readSettings(env)), ...patch };
  const dir = configDir(env, homedir());
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(settingsFile(env), `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
}

/** The fingerprint a stored key must carry to open this vault. */
export function vaultId(keyMaterial: VaultKeyMaterial): Promise<string> {
  return vaultFingerprint(keyMaterial.wrappedDekRecovery);
}

/**
 * Remember the DEK for this server and vault. Best effort: if neither the
 * keychain nor the file can be written, the next command asks again, which
 * is where things stood before. Returns where it went, or null.
 */
export async function rememberKey(
  env: NodeJS.ProcessEnv,
  keyMaterial: VaultKeyMaterial,
  dekBytes: Bytes,
): Promise<KeySource | null> {
  if (!(await rememberEnabled(env))) return null;
  const record: StoredKey = {
    v: 1,
    server: apiBaseUrl(env),
    vault: await vaultId(keyMaterial),
    key: bytesToBase64(dekBytes),
  };
  const text = JSON.stringify(record);

  const entry = await keyringEntry(env);
  if (entry) {
    try {
      entry.setPassword(text);
      await rm(keyFile(env), { force: true });
      return "keychain";
    } catch {
      // Keychain present but refused; fall through to the file.
    }
  }
  try {
    const file = keyFile(env);
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(file, `${text}\n`, { mode: 0o600 });
    await chmod(file, 0o600);
    return "file";
  } catch {
    return null;
  }
}

async function readStored(env: NodeJS.ProcessEnv): Promise<{ record: StoredKey; source: KeySource } | null> {
  const parse = (text: string | null): StoredKey | null => {
    if (!text) return null;
    try {
      const r = JSON.parse(text) as Partial<StoredKey>;
      return r.v === 1 && typeof r.server === "string" && typeof r.vault === "string" && typeof r.key === "string"
        ? (r as StoredKey)
        : null;
    } catch {
      return null;
    }
  };
  const entry = await keyringEntry(env);
  if (entry) {
    try {
      const record = parse(entry.getPassword());
      if (record) return { record, source: "keychain" };
    } catch {
      // Unreadable keychain; try the file.
    }
  }
  const record = parse(await readFile(keyFile(env), "utf8").catch(() => null));
  return record ? { record, source: "file" } : null;
}

/**
 * The remembered key for this vault, as a non-extractable CryptoKey, or null
 * when none is stored, remembering is off, or it belongs to another server or
 * vault. The raw bytes exist only for the import and are zeroed after it.
 */
export async function loadRememberedKey(
  env: NodeJS.ProcessEnv,
  keyMaterial: VaultKeyMaterial,
): Promise<{ key: CryptoKey; source: KeySource } | null> {
  if (!(await rememberEnabled(env))) return null;
  const stored = await readStored(env);
  if (!stored) return null;
  const { record, source } = stored;
  if (record.server !== apiBaseUrl(env) || record.vault !== (await vaultId(keyMaterial))) return null;
  const bytes = base64ToBytes(record.key);
  try {
    return { key: await importAesKey(bytes), source };
  } catch {
    return null;
  } finally {
    bytes.fill(0);
  }
}

/** Where a key is remembered for this server, without opening it; for `status`. */
export async function rememberedKeySource(env: NodeJS.ProcessEnv): Promise<KeySource | null> {
  const stored = await readStored(env);
  return stored && stored.record.server === apiBaseUrl(env) ? stored.source : null;
}

/** Forget the key for this server from everywhere it could be. True if one was there. */
export async function forgetKey(env: NodeJS.ProcessEnv): Promise<boolean> {
  const had = (await readStored(env)) !== null;
  const entry = await keyringEntry(env);
  if (entry) {
    try {
      entry.deletePassword();
    } catch {
      // Nothing stored, or no keychain.
    }
  }
  await rm(keyFile(env), { force: true });
  return had;
}
