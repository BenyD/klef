// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KdfParams, VaultKeyMaterial, WrappedKey } from "../shared/types.ts";
import { VaultProvider } from "./vault-session.tsx";
import { useVault } from "./vault-context.ts";

// In-memory stand-in for the server. Real crypto runs; only the network is faked.
const state = vi.hoisted(() => ({ stored: null as VaultKeyMaterial | null }));

vi.mock("./vault-api.ts", () => ({
  fetchVault: async () =>
    state.stored
      ? { exists: true, keyMaterial: state.stored, recoveryConfirmedAt: null }
      : { exists: false },
  createVault: async (m: VaultKeyMaterial) => {
    state.stored = m;
  },
  updateVaultPassphrase: async (kdfParams: KdfParams, wrappedDek: WrappedKey) => {
    if (!state.stored) throw new Error("no vault");
    state.stored = { ...state.stored, kdfParams, wrappedDek };
  },
  updateVaultRecovery: async () => {},
  confirmRecoverySaved: async () => {},
}));

// In-memory stand-in for the IndexedDB DEK cache (persistence across reloads).
const dekState = vi.hoisted(() => ({ saved: null as CryptoKey | null }));

vi.mock("./dek-store.ts", () => ({
  saveDek: async (_userId: string, dek: CryptoKey) => {
    dekState.saved = dek;
  },
  loadDek: async () => dekState.saved,
  clearDek: async () => {
    dekState.saved = null;
  },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <VaultProvider userId="user-1">{children}</VaultProvider>
);

beforeEach(() => {
  state.stored = null;
  dekState.saved = null;
});

describe("vault session (unlock gate)", () => {
  it("setup → confirm recovery → unlocked, with a real DEK in memory", async () => {
    const { result } = renderHook(() => useVault(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("needs-setup"));

    let recoveryKey = "";
    await act(async () => {
      recoveryKey = await result.current.runSetup("a strong passphrase");
    });

    expect(recoveryKey).toMatch(/^KLEF-/);
    // Not unlocked until the user confirms they saved the recovery key.
    expect(result.current.status).toBe("needs-setup");
    expect(result.current.dek).toBeNull();

    act(() => result.current.finishSetup());
    expect(result.current.status).toBe("unlocked");
    expect(result.current.dek).not.toBeNull();
  });

  it("starts locked when a vault already exists; unlock requires the right passphrase", async () => {
    // Seed a vault by running setup once.
    const setup = renderHook(() => useVault(), { wrapper });
    await waitFor(() => expect(setup.result.current.status).toBe("needs-setup"));
    await act(async () => {
      await setup.result.current.runSetup("correct passphrase");
    });

    // A fresh provider now finds an existing vault → locked.
    const { result } = renderHook(() => useVault(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("locked"));

    // Wrong passphrase is rejected and leaves the vault locked.
    await expect(
      act(async () => {
        await result.current.unlock("wrong passphrase");
      }),
    ).rejects.toThrow();
    expect(result.current.status).toBe("locked");
    expect(result.current.dek).toBeNull();

    // Correct passphrase unlocks.
    await act(async () => {
      await result.current.unlock("correct passphrase");
    });
    expect(result.current.status).toBe("unlocked");
    expect(result.current.dek).not.toBeNull();
  });

  it("remembers the unlock across reloads; lock forgets it; recovery still works", async () => {
    const seed = renderHook(() => useVault(), { wrapper });
    await waitFor(() => expect(seed.result.current.status).toBe("needs-setup"));
    let recoveryKey = "";
    await act(async () => {
      recoveryKey = await seed.result.current.runSetup("pw for recovery test");
    });
    act(() => seed.result.current.finishSetup());
    expect(seed.result.current.status).toBe("unlocked");

    // A fresh provider (simulating a reload) restores the remembered DEK
    // instead of prompting for the passphrase again.
    const reloaded = renderHook(() => useVault(), { wrapper });
    await waitFor(() => expect(reloaded.result.current.status).toBe("unlocked"));
    expect(reloaded.result.current.dek).not.toBeNull();

    // Locking forgets it, so the next load is locked again.
    act(() => reloaded.result.current.lock());
    expect(reloaded.result.current.status).toBe("locked");
    expect(reloaded.result.current.dek).toBeNull();

    const afterLock = renderHook(() => useVault(), { wrapper });
    await waitFor(() => expect(afterLock.result.current.status).toBe("locked"));

    // The recovery key still unlocks.
    await act(async () => {
      await afterLock.result.current.recover(recoveryKey);
    });
    expect(afterLock.result.current.status).toBe("unlocked");
  });

  it("recovery reset persists a new passphrase; the forgotten one is gone", async () => {
    const seed = renderHook(() => useVault(), { wrapper });
    await waitFor(() => expect(seed.result.current.status).toBe("needs-setup"));
    let recoveryKey = "";
    await act(async () => {
      recoveryKey = await seed.result.current.runSetup("forgotten pw");
    });

    // Locked user resets through the recovery flow.
    const locked = renderHook(() => useVault(), { wrapper });
    await waitFor(() => expect(locked.result.current.status).toBe("locked"));
    await act(async () => {
      await locked.result.current.recoverAndReset(recoveryKey, "brand new pw");
    });
    expect(locked.result.current.status).toBe("unlocked");
    expect(locked.result.current.dek).not.toBeNull();

    // After a lock (fresh provider), the new passphrase unlocks and the
    // forgotten one no longer does; the recovery key survives the reset.
    dekState.saved = null;
    const later = renderHook(() => useVault(), { wrapper });
    await waitFor(() => expect(later.result.current.status).toBe("locked"));
    await expect(
      act(async () => {
        await later.result.current.unlock("forgotten pw");
      }),
    ).rejects.toThrow();
    await act(async () => {
      await later.result.current.unlock("brand new pw");
    });
    expect(later.result.current.status).toBe("unlocked");
  });

  it("changePassphrase re-wraps for the new passphrase only", async () => {
    const seed = renderHook(() => useVault(), { wrapper });
    await waitFor(() => expect(seed.result.current.status).toBe("needs-setup"));
    await act(async () => {
      await seed.result.current.runSetup("original pw");
    });
    act(() => seed.result.current.finishSetup());

    // The wrong current passphrase is rejected and writes nothing.
    await expect(
      act(async () => {
        await seed.result.current.changePassphrase("wrong pw", "next pw");
      }),
    ).rejects.toThrow();

    await act(async () => {
      await seed.result.current.changePassphrase("original pw", "next pw");
    });

    dekState.saved = null;
    const later = renderHook(() => useVault(), { wrapper });
    await waitFor(() => expect(later.result.current.status).toBe("locked"));
    await expect(
      act(async () => {
        await later.result.current.unlock("original pw");
      }),
    ).rejects.toThrow();
    await act(async () => {
      await later.result.current.unlock("next pw");
    });
    expect(later.result.current.status).toBe("unlocked");
  });
});
