// Unlocking the CLI from the approval page (`klef login`, then /cli).
//
// The tab's own DEK is a non-extractable CryptoKey and stays one, so it
// cannot be handed over. Instead the page recovers the DEK's bytes the way an
// unlock does, from a passkey (one touch, when passkey unlock is set up) or
// the passphrase, seals them to the public key the CLI sent with its login,
// and zeroes them. Only the sealed blob leaves the page; see
// shared/device-unlock.ts for what it is bound to.

import { dekBytesWithPassphrase, dekBytesWithPrfSecret } from "../../shared/crypto.ts";
import type { DeviceJwk } from "../../shared/device-seal.ts";
import { sealVaultKey, type SealedVaultKey } from "../../shared/device-unlock.ts";
import { base64ToBytes, type Bytes } from "../../shared/encoding.ts";
import type { VaultPasskeyWrap } from "../../shared/api-types.ts";
import type { VaultKeyMaterial } from "../../shared/types.ts";
import type { PrfRequest, PrfResult } from "./passkey-prf.ts";

export class WrongPassphraseForCliError extends Error {
  constructor() {
    super("That passphrase didn't unlock the vault.");
  }
}

export interface CliUnlockDeps {
  /** The vault's key material and passkey wraps, fresh from the server. */
  vault: () => Promise<{ exists: boolean; keyMaterial?: VaultKeyMaterial; passkeyWraps?: VaultPasskeyWrap[] }>;
  /** The WebAuthn PRF ceremony (lib/passkey-prf.ts). */
  prf: (requests: PrfRequest[]) => Promise<PrfResult>;
}

export type CliUnlockMethod = { kind: "passkey" } | { kind: "passphrase"; passphrase: string };

/** Which way the page should offer: a passkey when one is set up for unlock, else the passphrase. */
export function preferredMethod(passkeyWraps: VaultPasskeyWrap[] | undefined): "passkey" | "passphrase" {
  return passkeyWraps && passkeyWraps.length > 0 ? "passkey" : "passphrase";
}

/**
 * Seal this user's DEK to the CLI asking to sign in. Throws
 * WrongPassphraseForCliError for a wrong passphrase, and whatever the passkey
 * ceremony throws (PasskeyPrfError) if that is cancelled or unsupported.
 */
export async function sealVaultKeyForCli(
  method: CliUnlockMethod,
  cli: { publicJwk: DeviceJwk; userCode: string; userId: string },
  deps: CliUnlockDeps,
): Promise<SealedVaultKey> {
  const vault = await deps.vault();
  if (!vault.exists || !vault.keyMaterial) throw new Error("This account has no vault yet.");

  let bytes: Bytes;
  if (method.kind === "passkey") {
    const wraps = vault.passkeyWraps ?? [];
    if (wraps.length === 0) throw new Error("No passkey is set up for unlock.");
    const result = await deps.prf(wraps.map((w) => ({ credentialId: w.credentialId, salt: base64ToBytes(w.prfSalt) })));
    const wrap = wraps.find((w) => w.credentialId === result.credentialId);
    if (!wrap) throw new Error("That passkey is not set up for unlock.");
    try {
      bytes = await dekBytesWithPrfSecret(result.secret, wrap.wrappedDek);
    } finally {
      result.secret.fill(0);
    }
  } else {
    try {
      bytes = await dekBytesWithPassphrase(method.passphrase, vault.keyMaterial.kdfParams, vault.keyMaterial.wrappedDek);
    } catch {
      throw new WrongPassphraseForCliError();
    }
  }

  try {
    return await sealVaultKey(cli.publicJwk, bytes, { userCode: cli.userCode, userId: cli.userId });
  } finally {
    bytes.fill(0);
  }
}
