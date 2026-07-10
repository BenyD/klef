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
  changePassphrase as changePassphraseWrap,
  enrollPasskeyWrap,
  randomBytes,
  resetPassphraseWithRecoveryKey,
  rotateRecoveryKey,
  setupVault,
  unlockWithPassphrase,
  unlockWithPrfSecret,
  unlockWithRecoveryKey,
} from "../shared/crypto.ts";
import { base64ToBytes, bytesToBase64 } from "../shared/encoding.ts";
import type { VaultKeyMaterial } from "../shared/types.ts";
import type { VaultPasskeyWrap } from "../shared/api-types.ts";
import {
  confirmRecoverySaved,
  createVault,
  deleteVaultPasskey,
  fetchVault,
  updateVaultPasskey,
  updateVaultPassphrase,
  updateVaultRecovery,
} from "./vault-api.ts";
import { getPrfSecret } from "./lib/passkey-prf.ts";
import { WrongPassphraseError } from "./vault-context.ts";
import { clearDek, loadDek, saveDek, touchDek } from "./dek-store.ts";
import { getAutoLockMinutes } from "./lib/auto-lock.ts";
import { VaultContext, type VaultStatus } from "./vault-context.ts";

// Cross-tab lock propagation: "lock" must mean locked everywhere, so lock()
// broadcasts and every other tab drops its in-memory DEK. Environments
// without BroadcastChannel just lose the propagation, not local locking.
const LOCK_CHANNEL = "klef:vault-lock";

// The persisted DEK ages out on the same clock as auto-lock, so closing the
// browser doesn't grant a longer unlocked window than staying idle would.
function dekMaxAgeMs(): number {
  const minutes = getAutoLockMinutes();
  return minutes > 0 ? minutes * 60_000 : Infinity;
}

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
  const [passkeyWraps, setPasskeyWraps] = useState<VaultPasskeyWrap[]>([]);
  const keyMaterial = useRef<VaultKeyMaterial | null>(null);
  // DEK staged during setup, activated once the recovery key is confirmed saved.
  const pendingDek = useRef<CryptoKey | null>(null);
  // Bumped by retryLoad() to re-run the initial fetch after a load error.
  const [loadNonce, setLoadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetchVault()
      .then(async (res) => {
        if (cancelled) return;
        keyMaterial.current = res.keyMaterial ?? null;
        if (!res.exists) {
          setStatus("needs-setup");
          return;
        }
        setRecoveryConfirmed(Boolean(res.recoveryConfirmedAt));
        setPasskeyWraps(res.passkeyWraps ?? []);
        // Skip the unlock prompt if this user's DEK is still remembered from a
        // previous load (persisted non-extractable, never re-derived).
        const cached = await loadDek(userId, dekMaxAgeMs());
        if (cancelled) return;
        if (cached) {
          setDek(cached);
          setStatus("unlocked");
        } else {
          setStatus("locked");
        }
      })
      .catch(() => {
        // A thrown fetch is a transient/server fault, NOT "no vault yet":
        // landing existing users on Onboarding dead-ends them (setup 409s).
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [userId, loadNonce]);

  const retryLoad = useCallback(() => setLoadNonce((n) => n + 1), []);

  // Listen for lock broadcasts from sibling tabs.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(LOCK_CHANNEL);
    channel.onmessage = () => {
      setDek(null);
      setStatus((s) => (s === "unlocked" ? "locked" : s));
    };
    return () => channel.close();
  }, []);

  // Keep the persisted DEK's freshness stamp current while unlocked, so an
  // in-use session isn't aged out by the auto-lock-aligned TTL.
  useEffect(() => {
    if (status !== "unlocked") return;
    const id = window.setInterval(() => void touchDek(userId), 60_000);
    return () => window.clearInterval(id);
  }, [status, userId]);

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

  // Always prefer the server's current key material: a passphrase change or
  // recovery rotation on another device otherwise leaves this tab validating
  // against a stale wrapping (the old secret accepted, the new one rejected).
  // Falls back to the cached copy only when the refetch itself fails.
  const freshMaterial = useCallback(async (): Promise<VaultKeyMaterial | null> => {
    try {
      const res = await fetchVault();
      keyMaterial.current = res.keyMaterial ?? null;
      setPasskeyWraps(res.passkeyWraps ?? []);
    } catch {
      // Offline or transient: better to try the cached material than nothing.
    }
    return keyMaterial.current;
  }, []);

  const unlock = useCallback(
    async (passphrase: string) => {
      const material = await freshMaterial();
      if (!material) throw new Error("No vault to unlock");
      const key = await unlockWithPassphrase(
        passphrase,
        material.kdfParams,
        material.wrappedDek,
      );
      setDek(key);
      await saveDek(userId, key);
      setStatus("unlocked");
    },
    [userId, freshMaterial],
  );

  // Recovery implies a forgotten passphrase, so the two happen as one step:
  // prove the recovery key by unwrapping the DEK, persist the new wrapping,
  // then unlock. Nothing unlocks until the server accepted the new material.
  const recoverAndReset = useCallback(
    async (recoveryKey: string, newPassphrase: string) => {
      const material = await freshMaterial();
      if (!material) throw new Error("No vault to recover");
      keyMaterial.current = material;
      const key = await unlockWithRecoveryKey(
        recoveryKey,
        material.wrappedDekRecovery,
      );
      const next = await resetPassphraseWithRecoveryKey(
        recoveryKey,
        newPassphrase,
        material.wrappedDekRecovery,
      );
      await updateVaultPassphrase(next.kdfParams, next.wrappedDek);
      keyMaterial.current = { ...material, ...next };
      setDek(key);
      await saveDek(userId, key);
      setStatus("unlocked");
    },
    [userId],
  );

  // Regular change while unlocked; the wrong current passphrase fails the
  // unwrap and throws before anything is written.
  const changePassphrase = useCallback(
    async (currentPassphrase: string, newPassphrase: string) => {
      const material = await freshMaterial();
      if (!material) throw new Error("No vault");
      const next = await changePassphraseWrap(
        currentPassphrase,
        newPassphrase,
        material.kdfParams,
        material.wrappedDek,
      );
      await updateVaultPassphrase(next.kdfParams, next.wrappedDek);
      keyMaterial.current = { ...material, ...next };
    },
    [freshMaterial],
  );

  const rotateRecovery = useCallback(
    async (passphrase: string) => {
      const material = await freshMaterial();
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
    },
    [freshMaterial],
  );

  // Passkey unlock: run the PRF ceremony over every enrolled credential and
  // unwrap with whichever the user picked. Fresh wraps are fetched first so
  // an enrollment or removal on another device is respected.
  const unlockWithPasskey = useCallback(async () => {
    let wraps = passkeyWraps;
    try {
      const res = await fetchVault();
      keyMaterial.current = res.keyMaterial ?? null;
      wraps = res.passkeyWraps ?? [];
      setPasskeyWraps(wraps);
    } catch {
      // Offline or transient: try the wraps we already have.
    }
    if (wraps.length === 0) {
      throw new Error("No passkey is set up for unlock");
    }
    const result = await getPrfSecret(
      wraps.map((w) => ({
        credentialId: w.credentialId,
        salt: base64ToBytes(w.prfSalt),
      })),
    );
    const wrap = wraps.find((w) => w.credentialId === result.credentialId);
    if (!wrap) {
      throw new Error("That passkey is not set up for unlock");
    }
    const key = await unlockWithPrfSecret(result.secret, wrap.wrappedDek);
    setDek(key);
    await saveDek(userId, key);
    setStatus("unlocked");
  }, [userId, passkeyWraps]);

  // Enrollment: validate the passphrase before the passkey prompt (a wrong
  // passphrase after a biometric ceremony would waste it), then derive the
  // PRF secret and persist the new wrap.
  const enrollPasskey = useCallback(
    async (
      passphrase: string,
      passkey: { id: string; credentialId: string },
    ) => {
      const material = await freshMaterial();
      if (!material) throw new Error("No vault");
      try {
        await unlockWithPassphrase(
          passphrase,
          material.kdfParams,
          material.wrappedDek,
        );
      } catch {
        throw new WrongPassphraseError("That passphrase didn't work.");
      }
      const prfSalt = randomBytes(32);
      const result = await getPrfSecret([
        { credentialId: passkey.credentialId, salt: prfSalt },
      ]);
      const wrappedDek = await enrollPasskeyWrap(
        passphrase,
        material.kdfParams,
        material.wrappedDek,
        result.secret,
      );
      const wrap: VaultPasskeyWrap = {
        passkeyId: passkey.id,
        credentialId: passkey.credentialId,
        prfSalt: bytesToBase64(prfSalt),
        wrappedDek,
      };
      await updateVaultPasskey(wrap);
      setPasskeyWraps((prev) => [
        ...prev.filter((w) => w.passkeyId !== passkey.id),
        wrap,
      ]);
    },
    [freshMaterial],
  );

  const removePasskeyUnlock = useCallback(async (passkeyId: string) => {
    await deleteVaultPasskey(passkeyId);
    setPasskeyWraps((prev) => prev.filter((w) => w.passkeyId !== passkeyId));
  }, []);

  const lock = useCallback(() => {
    setDek(null);
    void clearDek();
    setStatus("locked");
    if (typeof BroadcastChannel !== "undefined") {
      // Fire-and-close; sibling tabs drop their in-memory DEKs.
      const channel = new BroadcastChannel(LOCK_CHANNEL);
      channel.postMessage("lock");
      channel.close();
    }
  }, []);

  return (
    <VaultContext.Provider
      value={{
        status,
        dek,
        runSetup,
        finishSetup,
        unlock,
        recoverAndReset,
        changePassphrase,
        rotateRecovery,
        lock,
        retryLoad,
        recoveryConfirmed,
        passkeyWraps,
        unlockWithPasskey,
        enrollPasskey,
        removePasskeyUnlock,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}
