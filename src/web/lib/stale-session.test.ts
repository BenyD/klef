// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

const { toastError, signOut, clearDek } = vi.hoisted(() => ({
  toastError: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
  clearDek: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("sonner", () => ({ toast: { error: toastError } }));
vi.mock("../auth.ts", () => ({ signOut }));
vi.mock("../dek-store.ts", () => ({ clearDek }));

import { isStaleSession, staleSessionToast } from "./stale-session.ts";

describe("isStaleSession", () => {
  it("matches Better Auth's SESSION_NOT_FRESH code", () => {
    expect(isStaleSession({ code: "SESSION_NOT_FRESH" })).toBe(true);
  });

  it("ignores other errors and empty values", () => {
    expect(isStaleSession({ code: "UNAUTHORIZED" })).toBe(false);
    expect(isStaleSession({})).toBe(false);
    expect(isStaleSession(null)).toBe(false);
    expect(isStaleSession(undefined)).toBe(false);
  });
});

describe("staleSessionToast", () => {
  it("shows the blocked action with a sign-in-again escape hatch", () => {
    staleSessionToast("Adding a passkey");
    expect(toastError).toHaveBeenCalledOnce();
    const [message, options] = toastError.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe("Adding a passkey needs a recent sign-in");
    expect(options.action.label).toBe("Sign in again");
  });

  it("signs out and drops the cached key when the action is clicked", async () => {
    staleSessionToast("Adding a passkey");
    const [, options] = toastError.mock.calls.at(-1) as [
      string,
      { action: { onClick: () => void } },
    ];
    options.action.onClick();
    await vi.waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(clearDek).toHaveBeenCalled();
  });
});
