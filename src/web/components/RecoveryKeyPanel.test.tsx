// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RecoveryKeyPanel } from "./RecoveryKeyPanel.tsx";

const KEY = "KLEF-ABCDE-FGHIJ-KLMNO";
const EMAIL = "beny@example.com";

// happy-dom has no writable clipboard; it's stubbed per test.
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

  it("reports the key as saved after copying", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const onSaved = vi.fn();
    render(
      <RecoveryKeyPanel recoveryKey={KEY} email={EMAIL} onSaved={onSaved} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("reports the key as saved after downloading", () => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    });
    const onSaved = vi.fn();
    render(
      <RecoveryKeyPanel recoveryKey={KEY} email={EMAIL} onSaved={onSaved} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /download/i }));
    expect(onSaved).toHaveBeenCalledOnce();
  });

});
