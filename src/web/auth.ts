import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";

// Same-origin: the SPA and the Worker API share a host, so baseURL defaults
// correctly.
export const authClient = createAuthClient({
  plugins: [passkeyClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;

export function signInWithGoogle(callbackURL = "/app") {
  return signIn.social({ provider: "google", callbackURL });
}

// The user closing the WebAuthn prompt is a no-op, not an error to surface.
const PASSKEY_CANCEL_CODES = new Set(["ERROR_CEREMONY_ABORTED", "AUTH_CANCELLED"]);
export function isPasskeyCancel(
  error: { code?: string; message?: string } | null | undefined,
) {
  return !!error?.code && PASSKEY_CANCEL_CODES.has(error.code);
}

export function signInWithPasskey() {
  return signIn.passkey();
}

// Passkey-first sign-up: the form fields ride along as the WebAuthn context;
// the server creates the account and sets the session cookie once the new
// credential verifies, so poke the session atom to pick the session up.
export async function signUpWithPasskey(name: string, email: string) {
  const res = await authClient.passkey.addPasskey({
    context: JSON.stringify({ name, email }),
  });
  if (!res?.error) authClient.$store.notify("$sessionSignal");
  return res;
}
