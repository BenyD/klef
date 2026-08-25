// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Where the access token lives.
//
// The OS keychain first — macOS Keychain, libsecret, Windows Credential
// Manager — which is what Doppler and the GitHub CLI both do, and which keeps
// the token off disk. A 0600 file in the config directory is the fallback for
// headless Linux without libsecret, mirroring `gh`'s behaviour and Vault's
// ~/.vault-token.
//
// A stolen token is far less dangerous here than in a conventional secrets
// manager: it reaches ciphertext and plaintext names only. Decryption needs the
// passphrase, which is never stored anywhere by anything.

import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { configDir, credentialsFile } from "./paths.ts";
import { isTokenShape } from "../shared/access-token-format.ts";

const SERVICE = "klef";
const ACCOUNT = "access-token";

/** Owner-only, for both the file and the directory holding it. */
const OWNER_ONLY_FILE = 0o600;
const OWNER_ONLY_DIR = 0o700;

export type TokenSource = "keychain" | "file" | "environment";

export interface StoredToken {
  token: string;
  source: TokenSource;
}

interface KeyringEntry {
  getPassword(): string | null;
  setPassword(password: string): void;
  deletePassword(): boolean;
}

/**
 * The keychain binding is an optional native dependency: it may be absent
 * (install skipped the native build) or unusable (no libsecret, no D-Bus
 * session). Either way the file fallback takes over, so this resolves to null
 * rather than throwing.
 */
async function keyringEntry(env: NodeJS.ProcessEnv): Promise<KeyringEntry | null> {
  // Escape hatch for people who would rather not use the OS keychain, and the
  // switch the tests use so a test run can never write to a real keychain.
  if (env.KLEF_NO_KEYCHAIN) return null;
  try {
    const mod = (await import("@napi-rs/keyring")) as {
      Entry: new (service: string, account: string) => KeyringEntry;
    };
    return new mod.Entry(SERVICE, ACCOUNT);
  } catch {
    return null;
  }
}

export async function saveToken(
  token: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<TokenSource> {
  const entry = await keyringEntry(env);
  if (entry) {
    try {
      entry.setPassword(token);
      // Drop any earlier file copy, so the token doesn't linger on disk after
      // a machine gains a working keychain.
      await rm(credentialsFile(env, homedir()), { force: true });
      return "keychain";
    } catch {
      // Keychain present but refused (locked, denied). Fall through to file.
    }
  }

  const dir = configDir(env, homedir());
  await mkdir(dir, { recursive: true, mode: OWNER_ONLY_DIR });
  const file = path.join(dir, "credentials.json");
  await writeFile(file, `${JSON.stringify({ token }, null, 2)}\n`, {
    mode: OWNER_ONLY_FILE,
  });
  // writeFile's mode is ignored when the file already exists.
  await chmod(file, OWNER_ONLY_FILE);
  return "file";
}

export async function loadToken(
  env: NodeJS.ProcessEnv = process.env,
): Promise<StoredToken | null> {
  // An explicit environment token wins, for CI and for `KLEF_TOKEN=… klef pull`.
  const fromEnv = env.KLEF_TOKEN?.trim();
  if (fromEnv) return { token: fromEnv, source: "environment" };

  const entry = await keyringEntry(env);
  if (entry) {
    try {
      const token = entry.getPassword();
      if (token) return { token, source: "keychain" };
    } catch {
      // Unreadable keychain is not fatal; try the file.
    }
  }

  try {
    const raw = await readFile(credentialsFile(env, homedir()), "utf8");
    const parsed = JSON.parse(raw) as { token?: unknown };
    if (typeof parsed.token === "string" && parsed.token !== "") {
      return { token: parsed.token, source: "file" };
    }
  } catch {
    // Missing or corrupt file reads as "not signed in".
  }

  return null;
}

/** Remove the token from everywhere this module could have put it. */
export async function clearToken(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const entry = await keyringEntry(env);
  if (entry) {
    try {
      entry.deletePassword();
    } catch {
      // Nothing stored, or keychain unavailable.
    }
  }
  await rm(credentialsFile(env, homedir()), { force: true });
}

/** Reject a malformed token before it is stored or sent anywhere. */
export function validateToken(token: string): string {
  const trimmed = token.trim();
  if (!isTokenShape(trimmed)) {
    throw new Error(
      "That doesn't look like a Klef access token. Create one in Settings -> Security -> Developer; it starts with klef_pat_.",
    );
  }
  return trimmed;
}
