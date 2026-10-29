// SPDX-License-Identifier: MIT
//
// Turning a passphrase into the data-encryption key, locally.
//
// This is the crux of the whole design: the same src/shared/crypto.ts the
// browser uses, running in Node, against key material the server hands out as
// opaque ciphertext. The server is not involved in, and cannot observe, any of
// it — which is why adding a CLI doesn't weaken the zero-knowledge contract.

import { CliError } from "./ui.ts";
import { dekBytesWithPassphrase, importAesKey } from "../shared/crypto.ts";
import type { Bytes } from "../shared/encoding.ts";
import type { VaultKeyMaterial } from "../shared/types.ts";
import { promptSecret } from "./prompt.ts";

export class VaultLockedError extends Error {}
export class WrongPassphraseError extends CliError {
  constructor() {
    super("wrong_passphrase", "That passphrase didn't unlock the vault.");
  }
}

/**
 * Prompt for the passphrase and recover the DEK's raw bytes, for a caller
 * that keeps them (the key store) and zeroes them after. The passphrase itself
 * is only ever a local variable, never stored, never logged.
 */
export async function unlockVaultBytes(
  keyMaterial: VaultKeyMaterial,
  // Injectable so the unwrap path can be tested without a terminal. Production
  // always uses the /dev/tty reader; nothing in the CLI passes anything else.
  prompt: (question: string) => Promise<string> = promptSecret,
): Promise<Bytes> {
  const passphrase = await prompt("Master passphrase: ");
  if (!passphrase) throw new WrongPassphraseError();

  try {
    return await dekBytesWithPassphrase(passphrase, keyMaterial.kdfParams, keyMaterial.wrappedDek);
  } catch {
    // AES-GCM authentication failed, which for a wrapped DEK means exactly one
    // thing: the derived KEK was wrong.
    throw new WrongPassphraseError();
  }
}

/**
 * Prompt for the passphrase and unwrap the DEK.
 *
 * Returns a non-extractable CryptoKey: even this process cannot read the key
 * bytes back out, so a later bug can't print them.
 */
export async function unlockVault(
  keyMaterial: VaultKeyMaterial,
  prompt: (question: string) => Promise<string> = promptSecret,
): Promise<CryptoKey> {
  const bytes = await unlockVaultBytes(keyMaterial, prompt);
  try {
    return await importAesKey(bytes);
  } finally {
    bytes.fill(0);
  }
}
