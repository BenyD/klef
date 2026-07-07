// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VaultKeyMaterial } from "../shared/types.ts";
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
  updateVaultPassphrase: async () => {},
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
});
