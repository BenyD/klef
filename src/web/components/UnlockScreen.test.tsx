// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UnlockScreen } from "./UnlockScreen.tsx";
import { VaultContext, type VaultContextValue } from "../vault-context.ts";
import {
  AUTO_LOCK_DEFAULT_MINUTES,
  getAutoLockMinutes,
  REMEMBER_DEVICE_MINUTES,
  setAutoLockMinutes,
} from "../lib/auto-lock.ts";

// happy-dom here ships no localStorage, where the lock setting lives.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
});

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
  store.clear();
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

describe("UnlockScreen keep unlocked on this device", () => {
  function submitPassphrase() {
    fireEvent.change(screen.getByLabelText("Master passphrase"), {
      target: { value: "correct horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
  }

  it("is off unless the user opts in", async () => {
    const value = renderUnlock({ unlock: vi.fn().mockResolvedValue(undefined) });
    const box = screen.getByRole("checkbox", { name: "Keep unlocked on this device" });
    expect(box.getAttribute("aria-checked")).toBe("false");
    submitPassphrase();
    await waitFor(() => expect(value.unlock).toHaveBeenCalledWith("correct horse"));
    expect(getAutoLockMinutes()).toBe(AUTO_LOCK_DEFAULT_MINUTES);
  });

  it("ticking it keeps this device unlocked for 7 days", async () => {
    const value = renderUnlock({ unlock: vi.fn().mockResolvedValue(undefined) });
    fireEvent.click(screen.getByRole("checkbox", { name: "Keep unlocked on this device" }));
    submitPassphrase();
    await waitFor(() => expect(value.unlock).toHaveBeenCalled());
    await waitFor(() => expect(getAutoLockMinutes()).toBe(REMEMBER_DEVICE_MINUTES));
  });

  it("does not change the setting when the unlock fails", async () => {
    renderUnlock({ unlock: vi.fn().mockRejectedValue(new Error("nope")) });
    fireEvent.click(screen.getByRole("checkbox", { name: "Keep unlocked on this device" }));
    submitPassphrase();
    await screen.findByText("That passphrase didn't work.");
    expect(getAutoLockMinutes()).toBe(AUTO_LOCK_DEFAULT_MINUTES);
  });

  it("starts ticked once opted in, and clearing it revokes", async () => {
    setAutoLockMinutes(REMEMBER_DEVICE_MINUTES);
    const value = renderUnlock({ unlock: vi.fn().mockResolvedValue(undefined) });
    const box = screen.getByRole("checkbox", { name: "Keep unlocked on this device" });
    expect(box.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(box);
    submitPassphrase();
    await waitFor(() => expect(value.unlock).toHaveBeenCalled());
    await waitFor(() => expect(getAutoLockMinutes()).toBe(AUTO_LOCK_DEFAULT_MINUTES));
  });
});
