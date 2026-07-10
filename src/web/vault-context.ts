// The vault context and its hook live apart from VaultProvider so
// vault-session.tsx exports only a component: mixing a hook export into that
// file breaks React Fast Refresh, and because the provider sits at the app
// root, every hot edit remounted the whole tree and dropped the user back on
// the overview.
import { createContext, useContext } from "react";
import type { VaultPasskeyWrap } from "../shared/api-types.ts";

export type VaultStatus =
  | "loading"
  | "needs-setup"
  | "locked"
  | "unlocked"
  /** The initial vault fetch failed (transient/server); retry, don't setup. */
  | "error";

export interface VaultContextValue {
  status: VaultStatus;
  /** The session DEK, present only while unlocked. Never leaves memory. */
  dek: CryptoKey | null;
  /** Run first-run setup; persists material and returns the recovery key to show once. */
  runSetup(passphrase: string): Promise<string>;
  /** Activate the vault after the user confirms they saved the recovery key. */
  finishSetup(): void;
  /** Unlock with the passphrase. Throws on a wrong passphrase. */
  unlock(passphrase: string): Promise<void>;
  /**
   * Recover with the key AND set a new passphrase in one step (the standard
   * forgot-passphrase path). Throws before unlocking if either part fails.
   */
  recoverAndReset(recoveryKey: string, newPassphrase: string): Promise<void>;
  /** Re-wrap the DEK under a new passphrase. Throws on a wrong current one. */
  changePassphrase(
    currentPassphrase: string,
    newPassphrase: string,
  ): Promise<void>;
  /**
   * Mint a new recovery key (passphrase required to prove access). Returns
   * the new key to show once; the previous recovery key stops working.
   */
  rotateRecovery(passphrase: string): Promise<string>;
  /** Clear the DEK from memory without logging out. */
  lock(): void;
  /** Re-run the initial vault fetch after a load error. */
  retryLoad(): void;
  /** False when the user never confirmed saving a recovery key (nudge them). */
  recoveryConfirmed: boolean;
  /** Passkeys enrolled for unlock. Empty until enrollment. */
  passkeyWraps: VaultPasskeyWrap[];
  /**
   * Unlock with an enrolled passkey (WebAuthn PRF). Throws PasskeyPrfError
   * on cancel/unsupported, or a plain Error when nothing is enrolled.
   */
  unlockWithPasskey(): Promise<void>;
  /**
   * Enroll a passkey for unlock. The passphrase proves vault access (the
   * live DEK is non-extractable, so a re-wrap needs it), then a passkey
   * prompt derives the wrapping secret.
   */
  enrollPasskey(
    passphrase: string,
    passkey: { id: string; credentialId: string },
  ): Promise<void>;
  /** Remove a passkey's unlock wrap. The passkey stays for sign-in. */
  removePasskeyUnlock(passkeyId: string): Promise<void>;
}

export const VaultContext = createContext<VaultContextValue | null>(null);

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within a VaultProvider");
  return ctx;
}
