// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AuthPage } from "./AuthPage.tsx";

const signInWithGoogle = vi.hoisted(() => vi.fn());
const signInWithGitHub = vi.hoisted(() => vi.fn());
vi.mock("../auth.ts", () => ({
  isPasskeyCancel: () => false,
  signInWithGoogle,
  signInWithGitHub,
  signInWithPasskey: vi.fn(),
}));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  render(
    <MemoryRouter>
      <AuthPage />
    </MemoryRouter>,
  );
}

describe("AuthPage", () => {
  it("offers Google, GitHub, and passkey sign-in and nothing else", () => {
    renderPage();
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Continue with GitHub" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Sign in with a passkey" }),
    ).toBeTruthy();
    // No email/password form and no separate sign-up mode.
    expect(document.querySelector("form")).toBeNull();
    expect(document.querySelector("input")).toBeNull();
    expect(screen.queryByRole("button", { name: /create/i })).toBeNull();
  });

  it("starts the Google OAuth flow with the return path", () => {
    signInWithGoogle.mockResolvedValue({});
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(signInWithGoogle).toHaveBeenCalledWith("/app");
  });

  it("starts the GitHub OAuth flow with the return path", () => {
    signInWithGitHub.mockResolvedValue({});
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Continue with GitHub" }));
    expect(signInWithGitHub).toHaveBeenCalledWith("/app");
  });
});
