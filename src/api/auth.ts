import { betterAuth, type BetterAuthOptions } from "better-auth";
import { passkey } from "@better-auth/passkey";

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
