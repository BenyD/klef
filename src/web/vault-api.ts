import type { KdfParams, VaultKeyMaterial, WrappedKey } from "../shared/types.ts";
import { apiFetch } from "./api-fetch.ts";

interface VaultStatus {
  exists: boolean;
  keyMaterial?: VaultKeyMaterial;
  /** When the user last confirmed saving their recovery key; null = never. */
  recoveryConfirmedAt?: string | null;
}

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `Request failed (${res.status})`;
}

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
  const res = await apiFetch("/api/vault/passphrase", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kdfParams, wrappedDek }),
  });
  if (!res.ok) throw new Error(await readError(res));
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
