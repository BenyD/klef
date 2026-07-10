// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KdfParams, VaultKeyMaterial, WrappedKey } from "../shared/types.ts";
import { VaultProvider } from "./vault-session.tsx";
import { useVault } from "./vault-context.ts";

// In-memory stand-in for the server. Real crypto runs; only the network is faked.
const state = vi.hoisted(() => ({
  stored: null as VaultKeyMaterial | null,
  failPassphraseWrites: false,
  passkeyWraps: [] as Array<{
    passkeyId: string;
    credentialId: string;
    prfSalt: string;
    wrappedDek: WrappedKey;
  }>,
}));

vi.mock("./vault-api.ts", () => {
  class VaultWriteError extends Error {}
  return {
    VaultWriteError,
    fetchVault: async () =>
      state.stored
        ? {
            exists: true,
            keyMaterial: state.stored,
            recoveryConfirmedAt: null,
            passkeyWraps: state.passkeyWraps,
          }
        : { exists: false },
    createVault: async (m: VaultKeyMaterial) => {
      state.stored = m;
    },
    updateVaultPassphrase: async (kdfParams: KdfParams, wrappedDek: WrappedKey) => {
      if (state.failPassphraseWrites) throw new VaultWriteError("outage");
      if (!state.stored) throw new Error("no vault");
      state.stored = { ...state.stored, kdfParams, wrappedDek };
    },
    updateVaultRecovery: async () => {},
    confirmRecoverySaved: async () => {},
    updateVaultPasskey: async (wrap: (typeof state.passkeyWraps)[number]) => {
      state.passkeyWraps = [
        ...state.passkeyWraps.filter((w) => w.passkeyId !== wrap.passkeyId),
        wrap,
      ];
    },
    deleteVaultPasskey: async (passkeyId: string) => {
      state.passkeyWraps = state.passkeyWraps.filter(
        (w) => w.passkeyId !== passkeyId,
      );
    },
  };
});

// Fake authenticator: a stable 32-byte PRF secret per credential id. Real
// HKDF/AES run downstream; only the WebAuthn ceremony is faked.
const prfState = vi.hoisted(() => ({
  secrets: new Map<string, Uint8Array>(),
}));

vi.mock("./lib/passkey-prf.ts", () => {
  class PasskeyPrfError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    PasskeyPrfError,
    getPrfSecret: async (
      requests: Array<{ credentialId: string; salt: Uint8Array }>,
    ) => {
      for (const r of requests) {
        const secret = prfState.secrets.get(r.credentialId);
        if (secret) return { credentialId: r.credentialId, secret };
      }
      throw new PasskeyPrfError("no-secret", "no PRF for these credentials");
    },
  };
});

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
  state.failPassphraseWrites = false;
  state.passkeyWraps = [];
  dekState.saved = null;
  prfState.secrets.clear();
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

    // The recovery key still unlocks (resetting the passphrase on the way).
    await act(async () => {
      await afterLock.result.current.recoverAndReset(recoveryKey, "next pw 1");
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

  it("unlock validates against fresh material after a change elsewhere", async () => {
    // Device A sets up and stays mounted with cached key material.
    const deviceA = renderHook(() => useVault(), { wrapper });
    await waitFor(() => expect(deviceA.result.current.status).toBe("needs-setup"));
    await act(async () => {
      await deviceA.result.current.runSetup("first pw");
    });

    // Device B (fresh provider) changes the passphrase out from under A.
    const deviceB = renderHook(() => useVault(), { wrapper });
    await waitFor(() => expect(deviceB.result.current.status).toBe("locked"));
    await act(async () => {
      await deviceB.result.current.unlock("first pw");
      await deviceB.result.current.changePassphrase("first pw", "second pw");
    });

    // A's cached material is stale, but unlock refetches: the NEW passphrase
    // works and the OLD one is rejected, without any reload.
    dekState.saved = null;
    await expect(
      act(async () => {
        await deviceA.result.current.unlock("first pw");
      }),
    ).rejects.toThrow();
    await act(async () => {
      await deviceA.result.current.unlock("second pw");
    });
    expect(deviceA.result.current.status).toBe("unlocked");
  });

  it("a failed passphrase write during recovery reset never unlocks", async () => {
    const seed = renderHook(() => useVault(), { wrapper });
    await waitFor(() => expect(seed.result.current.status).toBe("needs-setup"));
    let recoveryKey = "";
    await act(async () => {
      recoveryKey = await seed.result.current.runSetup("pw before outage");
    });

    const locked = renderHook(() => useVault(), { wrapper });
    await waitFor(() => expect(locked.result.current.status).toBe("locked"));

    state.failPassphraseWrites = true;
    try {
      await expect(
        act(async () => {
          await locked.result.current.recoverAndReset(recoveryKey, "new pw");
        }),
      ).rejects.toThrow();
    } finally {
      state.failPassphraseWrites = false;
    }
    // Correct key, failed save: still locked, and the old passphrase intact.
    expect(locked.result.current.status).toBe("locked");
    await act(async () => {
      await locked.result.current.unlock("pw before outage");
    });
    expect(locked.result.current.status).toBe("unlocked");
  });

  it.skipIf(typeof BroadcastChannel === "undefined")(
    "locking one tab locks sibling tabs",
    async () => {
      const seed = renderHook(() => useVault(), { wrapper });
      await waitFor(() => expect(seed.result.current.status).toBe("needs-setup"));
      await act(async () => {
        await seed.result.current.runSetup("pw");
      });
      act(() => seed.result.current.finishSetup());

      // A second tab restores the remembered DEK and is unlocked too.
      const sibling = renderHook(() => useVault(), { wrapper });
      await waitFor(() => expect(sibling.result.current.status).toBe("unlocked"));

      act(() => seed.result.current.lock());
      await waitFor(() => expect(sibling.result.current.status).toBe("locked"));
      expect(sibling.result.current.dek).toBeNull();
    },
  );

  it("passkey enrollment needs the right passphrase and then unlocks", async () => {
    prfState.secrets.set(
      "cred-1",
      crypto.getRandomValues(new Uint8Array(32)),
    );

    const seed = renderHook(() => useVault(), { wrapper });
    await waitFor(() => expect(seed.result.current.status).toBe("needs-setup"));
    await act(async () => {
      await seed.result.current.runSetup("the passphrase");
    });
    act(() => seed.result.current.finishSetup());

    // A wrong passphrase rejects before any wrap is stored.
    await expect(
      act(async () => {
        await seed.result.current.enrollPasskey("wrong", {
          id: "pk-1",
          credentialId: "cred-1",
        });
      }),
    ).rejects.toThrow();
    expect(state.passkeyWraps).toHaveLength(0);

    await act(async () => {
      await seed.result.current.enrollPasskey("the passphrase", {
        id: "pk-1",
        credentialId: "cred-1",
      });
    });
    expect(state.passkeyWraps).toHaveLength(1);

    // A fresh provider (reload) sees the wrap and unlocks via the passkey.
    dekState.saved = null;
    const later = renderHook(() => useVault(), { wrapper });
    await waitFor(() => expect(later.result.current.status).toBe("locked"));
    expect(later.result.current.passkeyWraps).toHaveLength(1);
    await act(async () => {
      await later.result.current.unlockWithPasskey();
    });
    expect(later.result.current.status).toBe("unlocked");
    expect(later.result.current.dek).not.toBeNull();
  });

  it("a different PRF secret cannot unlock; removal disables the path", async () => {
    prfState.secrets.set("cred-2", crypto.getRandomValues(new Uint8Array(32)));

    const seed = renderHook(() => useVault(), { wrapper });
    await waitFor(() => expect(seed.result.current.status).toBe("needs-setup"));
    await act(async () => {
      await seed.result.current.runSetup("pw");
    });
    act(() => seed.result.current.finishSetup());
    await act(async () => {
      await seed.result.current.enrollPasskey("pw", {
        id: "pk-2",
        credentialId: "cred-2",
      });
    });

    // The authenticator now returns a different secret (e.g. wrong device):
    // the unwrap must fail and the vault stays locked.
    prfState.secrets.set("cred-2", crypto.getRandomValues(new Uint8Array(32)));
    dekState.saved = null;
    const locked = renderHook(() => useVault(), { wrapper });
    await waitFor(() => expect(locked.result.current.status).toBe("locked"));
    await expect(
      act(async () => {
        await locked.result.current.unlockWithPasskey();
      }),
    ).rejects.toThrow();
    expect(locked.result.current.status).toBe("locked");

    // Removing the wrap disables passkey unlock entirely.
    await act(async () => {
      await locked.result.current.removePasskeyUnlock("pk-2");
    });
    expect(locked.result.current.passkeyWraps).toHaveLength(0);
    await expect(
      act(async () => {
        await locked.result.current.unlockWithPasskey();
      }),
    ).rejects.toThrow(/no passkey/i);
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
