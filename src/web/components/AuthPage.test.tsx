// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AuthPage } from "./AuthPage.tsx";

const signInWithGoogle = vi.hoisted(() => vi.fn());
const signInWithGitHub = vi.hoisted(() => vi.fn());
const signInWithPasskey = vi.hoisted(() => vi.fn());
vi.mock("../auth.ts", () => ({
  signInWithGoogle,
  signInWithGitHub,
  signInWithPasskey,
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

  it("links the terms and privacy policy", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe(
      "/terms",
    );
    expect(
      screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href"),
    ).toBe("/privacy");
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

  it("stays quiet when the passkey prompt is dismissed", async () => {
    // simplewebauthn reports a dismissed prompt as a NotAllowedError
    // passthrough; that's a user choice, not an error to show.
    signInWithPasskey.mockResolvedValue({
      error: {
        code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
        message: "Auth cancelled",
      },
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Sign in with a passkey" }),
      ).toBeTruthy(),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows real passkey failures in an alert", async () => {
    signInWithPasskey.mockResolvedValue({
      error: { code: "ERROR_INVALID_RP_ID", message: "Auth cancelled" },
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Auth cancelled");
  });
});
