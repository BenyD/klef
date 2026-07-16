import { toast } from "sonner";
import { signOut } from "../auth.ts";
import { clearDek } from "../dek-store.ts";

/**
 * Better Auth guards sensitive operations (adding a passkey, deleting the
 * account) behind a fresh session: one created within the last 24 hours.
 * An older session gets a SESSION_NOT_FRESH rejection, which deserves a
 * "sign in again" path rather than a raw error message.
 */
export function isStaleSession(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  return error?.code === "SESSION_NOT_FRESH";
}

/**
 * Explains the stale session and offers a one-click way out: sign out (and
 * drop the cached vault key) so the user lands on the login page and comes
 * back with a fresh session.
 */
export function staleSessionToast(action: string) {
  toast.error(`${action} needs a recent sign-in`, {
    description: "Your session is a day or more old. Sign in again to continue.",
    action: {
      label: "Sign in again",
      onClick: () => {
        void clearDek()
          .then(() => signOut())
          .then(() => window.location.assign("/"));
      },
    },
  });
}
