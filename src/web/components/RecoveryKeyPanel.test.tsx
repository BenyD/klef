// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RecoveryKeyPanel } from "./RecoveryKeyPanel.tsx";

const KEY = "KLEF-ABCDE-FGHIJ-KLMNO";
const EMAIL = "beny@example.com";

// happy-dom provides neither the Credential Management API nor a writable
// clipboard; both are stubbed per test.
beforeEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RecoveryKeyPanel", () => {
  it("shows the key in a credential-shaped field managers can save", () => {
    render(<RecoveryKeyPanel recoveryKey={KEY} email={EMAIL} />);
    const field = screen.getByLabelText<HTMLInputElement>("Recovery key");
    expect(field.value).toBe(KEY);
    expect(field.autocomplete).toBe("new-password");
    expect(field.readOnly).toBe(true);
    // The hidden username gives managers the account identifier.
    const username = document.querySelector<HTMLInputElement>(
      'input[autocomplete="username"]',
    );
    expect(username?.value).toBe(EMAIL);
  });

  it("copies the key to the clipboard", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<RecoveryKeyPanel recoveryKey={KEY} email={EMAIL} />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith(KEY);
  });

  it("hides the password-manager button when the API is unavailable", () => {
    render(<RecoveryKeyPanel recoveryKey={KEY} email={EMAIL} />);
    expect(
      screen.queryByRole("button", { name: /password manager/i }),
    ).toBeNull();
  });

  it("stores a credential via the Credential Management API", async () => {
    class FakePasswordCredential {
      id: string;
      name: string;
      password: string;
      constructor(init: { id: string; name: string; password: string }) {
        this.id = init.id;
        this.name = init.name;
        this.password = init.password;
      }
    }
    const store = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("PasswordCredential", FakePasswordCredential);
    // window is the global in happy-dom, so stubbing the global also makes
    // the `"PasswordCredential" in window` feature check pass.
    vi.stubGlobal("navigator", { ...navigator, credentials: { store } });

    render(<RecoveryKeyPanel recoveryKey={KEY} email={EMAIL} />);
    fireEvent.click(screen.getByRole("button", { name: /password manager/i }));

    expect(store).toHaveBeenCalledTimes(1);
    const credential = store.mock.calls[0]![0] as FakePasswordCredential;
    expect(credential.id).toBe(EMAIL);
    expect(credential.password).toBe(KEY);
  });
});
