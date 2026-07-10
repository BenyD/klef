import type { KdfParams, VaultKeyMaterial, WrappedKey } from "../shared/types.ts";
import type { VaultPasskeyWrap } from "../shared/api-types.ts";
import { apiFetch } from "./api-fetch.ts";

interface VaultStatus {
  exists: boolean;
  keyMaterial?: VaultKeyMaterial;
  /** When the user last confirmed saving their recovery key; null = never. */
  recoveryConfirmedAt?: string | null;
  /** Passkeys enrolled for PRF unlock (opaque wraps + public salts). */
  passkeyWraps?: VaultPasskeyWrap[];
}

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `Request failed (${res.status})`;
}

/**
 * A vault write that failed AFTER client-side crypto already succeeded
 * (network or server fault). Callers use this to avoid blaming the user's
 * key or passphrase for a save problem.
 */
export class VaultWriteError extends Error {}

/** Does the current user have a vault, and its (opaque) key material if so. */
export async function fetchVault(): Promise<VaultStatus> {
  const res = await apiFetch("/api/vault");
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

/** First-run: persist the wrapped DEKs + KDF params. */
export async function createVault(material: VaultKeyMaterial): Promise<void> {
  const res = await apiFetch("/api/vault", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(material),
  });
  if (!res.ok) throw new Error(await readError(res));
}

/** Passphrase change: store the re-wrapped DEK + new KDF params. */
export async function updateVaultPassphrase(
  kdfParams: KdfParams,
  wrappedDek: WrappedKey,
): Promise<void> {
  let res: Response;
  try {
    res = await apiFetch("/api/vault/passphrase", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kdfParams, wrappedDek }),
    });
  } catch (e) {
    throw new VaultWriteError(e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) throw new VaultWriteError(await readError(res));
}

/** Recovery-key rotation: store the newly recovery-wrapped DEK. */
export async function updateVaultRecovery(
  wrappedDekRecovery: WrappedKey,
): Promise<void> {
  const res = await apiFetch("/api/vault/recovery", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wrappedDekRecovery }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

/** Record that the user confirmed saving their recovery key. */
export async function confirmRecoverySaved(): Promise<void> {
  const res = await apiFetch("/api/vault/recovery-confirmed", { method: "POST" });
  if (!res.ok) throw new Error(await readError(res));
}

/** Enroll (or refresh) a passkey unlock wrap. */
export async function updateVaultPasskey(wrap: VaultPasskeyWrap): Promise<void> {
  let res: Response;
  try {
    res = await apiFetch("/api/vault/passkey", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(wrap),
    });
  } catch (e) {
    throw new VaultWriteError(e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) throw new VaultWriteError(await readError(res));
}

/** Remove a passkey's unlock wrap (the passkey stays for sign-in). */
export async function deleteVaultPasskey(passkeyId: string): Promise<void> {
  const res = await apiFetch(
    `/api/vault/passkey/${encodeURIComponent(passkeyId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(await readError(res));
}
