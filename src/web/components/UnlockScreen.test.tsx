// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { UnlockScreen } from "./UnlockScreen.tsx";
import { VaultContext, type VaultContextValue } from "../vault-context.ts";

// The shell pulls in the auth client and router; neither matters here.
vi.mock("./AuthShell.tsx", () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

function renderUnlock(overrides: Partial<VaultContextValue>) {
  const value = {
    status: "locked",
    dek: null,
    runSetup: vi.fn(),
    finishSetup: vi.fn(),
    unlock: vi.fn(),
    recoverAndReset: vi.fn(),
    changePassphrase: vi.fn(),
    rotateRecovery: vi.fn(),
    lock: vi.fn(),
    retryLoad: vi.fn(),
    recoveryConfirmed: true,
    passkeyWraps: [],
    unlockWithPasskey: vi.fn().mockResolvedValue(undefined),
    enrollPasskey: vi.fn(),
    removePasskeyUnlock: vi.fn(),
    ...overrides,
  } as VaultContextValue;
  render(
    <VaultContext.Provider value={value}>
      <UnlockScreen />
    </VaultContext.Provider>,
  );
  return value;
}

const WRAP = {
  passkeyId: "pk1",
  credentialId: "cred1",
  prfSalt: "salt",
  wrappedDek: { v: 1 as const, alg: "AES-GCM" as const, nonce: "n", ciphertext: "c" },
};

beforeEach(() => {
  cleanup();
});

describe("UnlockScreen passkey auto-prompt", () => {
  it("asks for the passkey on arrival when unlock is enrolled", () => {
    const value = renderUnlock({ passkeyWraps: [WRAP] });
    expect(value.unlockWithPasskey).toHaveBeenCalledOnce();
  });

  it("prompts only once, not on every re-render", async () => {
    const value = renderUnlock({ passkeyWraps: [WRAP] });
    // The busy label flips state, which re-renders; the guard must hold.
    await screen.findByText("Waiting for your passkey...");
    expect(value.unlockWithPasskey).toHaveBeenCalledOnce();
  });

  it("stays quiet when no passkey is enrolled for unlock", () => {
    const value = renderUnlock({ passkeyWraps: [] });
    expect(value.unlockWithPasskey).not.toHaveBeenCalled();
    expect(screen.queryByText("Unlock with a passkey")).toBeNull();
  });
});
