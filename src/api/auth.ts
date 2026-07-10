import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError, getSessionFromCtx } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { passkey } from "@better-auth/passkey";
import {
  defaultPasskeyName,
  parsePasskeySignupContext,
} from "./passkey-signup.ts";

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
}

export function buildAuthOptions(deps: AuthDeps): BetterAuthOptions {
  const url = new URL(deps.baseURL);
  return {
    appName: "Klef",
    database: deps.database,
    secret: deps.secret,
    baseURL: deps.baseURL,
    // Login methods (the auth gate, separate from the crypto unlock gate). The
    // login password is NOT the vault passphrase; the master passphrase still
    // decrypts data and never touches the server.
    emailAndPassword: { enabled: true },
    // Account deletion needs a fresh session. Every app table (vault,
    // workspaces, and Better Auth's own) cascades from user(id), so the one
    // DELETE wipes all of the account's data.
    user: { deleteUser: { enabled: true } },
    socialProviders: {
      google: {
        clientId: deps.google.clientId,
        clientSecret: deps.google.clientSecret,
      },
    },
    plugins: [
      passkey({
        rpID: url.hostname,
        rpName: "Klef",
        origin: url.origin,
        // Passkey-first sign-up: with no session, the client sends its form
        // fields as the WebAuthn `context`. No user row is created until the
        // credential actually verifies; signed-in users adding a passkey from
        // settings still resolve through their session and never hit these.
        registration: {
          requireSession: false,
          // Ask authenticators to enable PRF on new credentials so they can
          // later be enrolled for vault unlock (see lib/passkey-prf.ts). The
          // secret itself is only ever derived client-side. hmacCreateSecret
          // is the CTAP2 flag PRF rides on for security keys; the `prf` spread
          // is cast because simplewebauthn's extension types lag WebAuthn L3.
          extensions: {
            hmacCreateSecret: true,
            ...({ prf: {} } as object),
          },
          resolveUser: async ({ ctx, context }) => {
            const signup = parsePasskeySignupContext(context);
            if (!signup) {
              throw new APIError("BAD_REQUEST", {
                message: "Enter your name and email to sign up with a passkey.",
              });
            }
            if (await ctx.context.internalAdapter.findUserByEmail(signup.email)) {
              throw new APIError("BAD_REQUEST", {
                message:
                  "An account with this email already exists. Sign in instead.",
              });
            }
            // Provisional identity for the WebAuthn ceremony only; the real
            // user row is created in afterVerification.
            return {
              id: `signup:${signup.email}`,
              name: signup.email,
              displayName: signup.name,
            };
          },
          afterVerification: async ({ ctx, verification, context }) => {
            // Stored label for the new credential ("iCloud Keychain · Jul
            // 2026"). A client-supplied name would take precedence, but Klef
            // never sends one; unknown AAGUIDs stay unnamed and the UI falls
            // back to its own display mapping.
            const name = defaultPasskeyName(
              verification.registrationInfo?.aaguid,
            );
            const signup = parsePasskeySignupContext(context);
            // A signed-in user adding a passkey from settings: just the label.
            if (!signup || (await getSessionFromCtx(ctx))) {
              return name ? { name } : undefined;
            }
            if (await ctx.context.internalAdapter.findUserByEmail(signup.email)) {
              throw new APIError("BAD_REQUEST", {
                message:
                  "An account with this email already exists. Sign in instead.",
              });
            }
            const user = await ctx.context.internalAdapter.createUser({
              name: signup.name,
              email: signup.email,
              emailVerified: false,
            });
            const session = await ctx.context.internalAdapter.createSession(
              user.id,
            );
            await setSessionCookie(ctx, { session, user });
            return { userId: user.id, ...(name ? { name } : {}) };
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
    }),
  );
}

export type Auth = ReturnType<typeof createAuth>;
