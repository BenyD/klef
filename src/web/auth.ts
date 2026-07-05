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
