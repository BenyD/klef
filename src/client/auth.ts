import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";

// Same-origin: the SPA and the Worker API share a host, so baseURL defaults
// correctly. Passkey client is wired now so it's ready for the fast-follow,
// but the UI surfaces Google first (login stays deliberately simple).
export const authClient = createAuthClient({
  plugins: [passkeyClient()],
});

export const { signIn, signOut, useSession } = authClient;

export function signInWithGoogle() {
  return signIn.social({ provider: "google", callbackURL: "/" });
}
