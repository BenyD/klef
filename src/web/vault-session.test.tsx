// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VaultKeyMaterial } from "../shared/types.ts";
import { VaultProvider, useVault } from "./vault-session.tsx";

// In-memory stand-in for the server. Real crypto runs; only the network is faked.
const state = vi.hoisted(() => ({ stored: null as VaultKeyMaterial | null }));

vi.mock("./vault-api.ts", () => ({
  fetchVault: async () =>
    state.stored
      ? { exists: true, keyMaterial: state.stored }
      : { exists: false },
  createVault: async (m: VaultKeyMaterial) => {
    state.stored = m;
  },
  updateVaultPassphrase: async () => {},
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <VaultProvider>{children}</VaultProvider>
);

beforeEach(() => {
  state.stored = null;
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

  it("lock clears the DEK; the recovery key can unlock", async () => {
    const seed = renderHook(() => useVault(), { wrapper });
    await waitFor(() => expect(seed.result.current.status).toBe("needs-setup"));
    let recoveryKey = "";
    await act(async () => {
      recoveryKey = await seed.result.current.runSetup("pw for recovery test");
    });
    act(() => seed.result.current.finishSetup());

    const { result } = renderHook(() => useVault(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("locked"));

    await act(async () => {
      await result.current.recover(recoveryKey);
    });
    expect(result.current.status).toBe("unlocked");

    act(() => result.current.lock());
    expect(result.current.status).toBe("locked");
    expect(result.current.dek).toBeNull();
  });
});
