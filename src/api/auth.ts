import { betterAuth, type BetterAuthOptions } from "better-auth";
import { passkey } from "@better-auth/passkey";
import { defaultPasskeyName } from "./passkey-name.ts";

/**
 * Inputs that differ between the runtime (Cloudflare D1) and offline schema
 * generation (better-sqlite3). Everything else lives in `buildAuthOptions` so
 * the two can never drift apart.
 */
export interface AuthDeps {
  database: BetterAuthOptions["database"];
  secret: string;
  /** Full origin, e.g. http://localhost:5173 — used for baseURL + passkey RP. */
  baseURL: string;
  google: { clientId: string; clientSecret: string };
  github: { clientId: string; clientSecret: string };
}

export function buildAuthOptions(deps: AuthDeps): BetterAuthOptions {
  const url = new URL(deps.baseURL);
  return {
    appName: "Klef",
    database: deps.database,
    secret: deps.secret,
    baseURL: deps.baseURL,
    // Login methods (the auth gate, separate from the crypto unlock gate):
    // Google/GitHub OAuth to sign up or sign in, passkeys to sign in. The
    // master passphrase still decrypts data and never touches the server.
    // Account deletion needs a fresh session. Every app table (vault,
    // workspaces, and Better Auth's own) cascades from user(id), so the one
    // DELETE wipes all of the account's data.
    user: { deleteUser: { enabled: true } },
    socialProviders: {
      google: {
        clientId: deps.google.clientId,
        clientSecret: deps.google.clientSecret,
      },
      github: {
        clientId: deps.github.clientId,
        clientSecret: deps.github.clientSecret,
      },
    },
    plugins: [
      passkey({
        rpID: url.hostname,
        rpName: "Klef",
        origin: url.origin,
        // Registration is session-only: passkeys are added from settings by a
        // signed-in user. Sign-up happens with Google or email/password first.
        registration: {
          // Ask authenticators to enable PRF on new credentials so they can
          // later be enrolled for vault unlock (see lib/passkey-prf.ts). The
          // secret itself is only ever derived client-side. hmacCreateSecret
          // is the CTAP2 flag PRF rides on for security keys; the `prf` spread
          // is cast because simplewebauthn's extension types lag WebAuthn L3.
          extensions: {
            hmacCreateSecret: true,
            ...({ prf: {} } as object),
          },
          afterVerification: async ({ verification }) => {
            // Stored label for the new credential ("iCloud Keychain · Jul
            // 2026"). A client-supplied name would take precedence, but Klef
            // never sends one; unknown AAGUIDs stay unnamed and the UI falls
            // back to its own display mapping.
            const name = defaultPasskeyName(
              verification.registrationInfo?.aaguid,
            );
            return name ? { name } : undefined;
          },
        },
      }),
    ],
  };
}

/** Runtime auth instance — instantiated per request because bindings come from `env`. */
export function createAuth(env: Env) {
  return betterAuth(
    buildAuthOptions({
      database: env.DB,
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
    }),
  );
}

export type Auth = ReturnType<typeof createAuth>;
