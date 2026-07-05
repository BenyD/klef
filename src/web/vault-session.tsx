import {
  createContext,
  useCallback,
  useContext,
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
import { createVault, fetchVault, updateVaultRecovery } from "./vault-api.ts";
import { clearDek, loadDek, saveDek } from "./dek-store.ts";

export type VaultStatus = "loading" | "needs-setup" | "locked" | "unlocked";

interface VaultContextValue {
  status: VaultStatus;
  /** The session DEK, present only while unlocked. Never leaves memory. */
  dek: CryptoKey | null;
  /** Run first-run setup; persists material and returns the recovery key to show once. */
  runSetup(passphrase: string): Promise<string>;
  /** Activate the vault after the user confirms they saved the recovery key. */
  finishSetup(): void;
  /** Unlock with the passphrase. Throws on a wrong passphrase. */
  unlock(passphrase: string): Promise<void>;
  /** Unlock with the recovery key. Throws if it doesn't match. */
  recover(recoveryKey: string): Promise<void>;
  /**
   * Mint a new recovery key (passphrase required to prove access). Returns
   * the new key to show once; the previous recovery key stops working.
   */
  rotateRecovery(passphrase: string): Promise<string>;
  /** Clear the DEK from memory without logging out. */
  lock(): void;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<VaultStatus>("loading");
  const [dek, setDek] = useState<CryptoKey | null>(null);
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
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within a VaultProvider");
  return ctx;
}
