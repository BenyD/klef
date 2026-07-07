// Component-only module (Fast Refresh boundary); the context and useVault
// hook live in vault-context.ts.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  rotateRecoveryKey,
  setupVault,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
} from "../shared/crypto.ts";
import type { VaultKeyMaterial } from "../shared/types.ts";
import {
  confirmRecoverySaved,
  createVault,
  fetchVault,
  updateVaultRecovery,
} from "./vault-api.ts";
import { clearDek, loadDek, saveDek } from "./dek-store.ts";
import { VaultContext, type VaultStatus } from "./vault-context.ts";

export function VaultProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<VaultStatus>("loading");
  const [dek, setDek] = useState<CryptoKey | null>(null);
  // Optimistic default so the nudge banner never flashes while loading.
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(true);
  const keyMaterial = useRef<VaultKeyMaterial | null>(null);
  // DEK staged during setup, activated once the recovery key is confirmed saved.
  const pendingDek = useRef<CryptoKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchVault()
      .then(async (res) => {
        if (cancelled) return;
        keyMaterial.current = res.keyMaterial ?? null;
        if (!res.exists) {
          setStatus("needs-setup");
          return;
        }
        setRecoveryConfirmed(Boolean(res.recoveryConfirmedAt));
        // Skip the unlock prompt if this user's DEK is still remembered from a
        // previous load (persisted non-extractable, never re-derived).
        const cached = await loadDek(userId);
        if (cancelled) return;
        if (cached) {
          setDek(cached);
          setStatus("unlocked");
        } else {
          setStatus("locked");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("needs-setup");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const runSetup = useCallback(async (passphrase: string) => {
    const { keyMaterial: material, recoveryKey, dek: newDek } =
      await setupVault(passphrase);
    await createVault(material);
    keyMaterial.current = material;
    pendingDek.current = newDek;
    return recoveryKey;
  }, []);

  const finishSetup = useCallback(() => {
    const key = pendingDek.current;
    setDek(key);
    pendingDek.current = null;
    if (key) void saveDek(userId, key);
    setStatus("unlocked");
    // The setup flow's "I saved my recovery key" checkbox was just ticked.
    setRecoveryConfirmed(true);
    confirmRecoverySaved().catch(() => {
      // Non-critical; the nudge banner simply returns next load.
    });
  }, [userId]);

  const unlock = useCallback(
    async (passphrase: string) => {
      const material = keyMaterial.current ?? (await fetchVault()).keyMaterial;
      if (!material) throw new Error("No vault to unlock");
      keyMaterial.current = material;
      const key = await unlockWithPassphrase(
        passphrase,
        material.kdfParams,
        material.wrappedDek,
      );
      setDek(key);
      await saveDek(userId, key);
      setStatus("unlocked");
    },
    [userId],
  );

  const recover = useCallback(
    async (recoveryKey: string) => {
      const material = keyMaterial.current ?? (await fetchVault()).keyMaterial;
      if (!material) throw new Error("No vault to recover");
      keyMaterial.current = material;
      const key = await unlockWithRecoveryKey(
        recoveryKey,
        material.wrappedDekRecovery,
      );
      setDek(key);
      await saveDek(userId, key);
      setStatus("unlocked");
    },
    [userId],
  );

  const rotateRecovery = useCallback(async (passphrase: string) => {
    const material = keyMaterial.current ?? (await fetchVault()).keyMaterial;
    if (!material) throw new Error("No vault");
    const { recoveryKey, wrappedDekRecovery } = await rotateRecoveryKey(
      passphrase,
      material.kdfParams,
      material.wrappedDek,
    );
    await updateVaultRecovery(wrappedDekRecovery);
    keyMaterial.current = { ...material, wrappedDekRecovery };
    // Rotating shows the new key with copy/download; the server stamps
    // confirmation on the same write.
    setRecoveryConfirmed(true);
    return recoveryKey;
  }, []);

  const lock = useCallback(() => {
    setDek(null);
    void clearDek();
    setStatus("locked");
  }, []);

  return (
    <VaultContext.Provider
      value={{
        status,
        dek,
        runSetup,
        finishSetup,
        unlock,
        recover,
        rotateRecovery,
        lock,
        recoveryConfirmed,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}
