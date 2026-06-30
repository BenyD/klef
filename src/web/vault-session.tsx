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
  setupVault,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
} from "../shared/crypto.ts";
import type { VaultKeyMaterial } from "../shared/types.ts";
import { createVault, fetchVault } from "./vault-api.ts";

export type VaultStatus = "loading" | "needs-setup" | "locked" | "unlocked";

interface VaultContextValue {
  status: VaultStatus;
  /** The session DEK — present only while unlocked. Never leaves memory. */
  dek: CryptoKey | null;
  /** Run first-run setup; persists material and returns the recovery key to show once. */
  runSetup(passphrase: string): Promise<string>;
  /** Activate the vault after the user confirms they saved the recovery key. */
  finishSetup(): void;
  /** Unlock with the passphrase. Throws on a wrong passphrase. */
  unlock(passphrase: string): Promise<void>;
  /** Unlock with the recovery key. Throws if it doesn't match. */
  recover(recoveryKey: string): Promise<void>;
  /** Clear the DEK from memory without logging out. */
  lock(): void;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>("loading");
  const [dek, setDek] = useState<CryptoKey | null>(null);
  const keyMaterial = useRef<VaultKeyMaterial | null>(null);
  // DEK staged during setup, activated once the recovery key is confirmed saved.
  const pendingDek = useRef<CryptoKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchVault()
      .then((res) => {
        if (cancelled) return;
        keyMaterial.current = res.keyMaterial ?? null;
        setStatus(res.exists ? "locked" : "needs-setup");
      })
      .catch(() => {
        if (!cancelled) setStatus("needs-setup");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runSetup = useCallback(async (passphrase: string) => {
    const { keyMaterial: material, recoveryKey, dek: newDek } =
      await setupVault(passphrase);
    await createVault(material);
    keyMaterial.current = material;
    pendingDek.current = newDek;
    return recoveryKey;
  }, []);

  const finishSetup = useCallback(() => {
    setDek(pendingDek.current);
    pendingDek.current = null;
    setStatus("unlocked");
  }, []);

  const unlock = useCallback(async (passphrase: string) => {
    const material = keyMaterial.current ?? (await fetchVault()).keyMaterial;
    if (!material) throw new Error("No vault to unlock");
    keyMaterial.current = material;
    const key = await unlockWithPassphrase(
      passphrase,
      material.kdfParams,
      material.wrappedDek,
    );
    setDek(key);
    setStatus("unlocked");
  }, []);

  const recover = useCallback(async (recoveryKey: string) => {
    const material = keyMaterial.current ?? (await fetchVault()).keyMaterial;
    if (!material) throw new Error("No vault to recover");
    keyMaterial.current = material;
    const key = await unlockWithRecoveryKey(
      recoveryKey,
      material.wrappedDekRecovery,
    );
    setDek(key);
    setStatus("unlocked");
  }, []);

  const lock = useCallback(() => {
    setDek(null);
    setStatus("locked");
  }, []);

  return (
    <VaultContext.Provider
      value={{ status, dek, runSetup, finishSetup, unlock, recover, lock }}
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
