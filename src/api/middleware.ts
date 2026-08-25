import { createMiddleware } from "hono/factory";
import { createAuth } from "./auth.ts";
import {
  hashToken,
  isExpired,
  isTokenShape,
  parseBearer,
  shouldTouchLastUsed,
} from "./access-token.ts";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

/** Which gate let a request through. See `requireSession` for why it matters. */
export type AuthKind = "session" | "token";

export interface AuthVariables {
  user: AuthUser;
  /** Better Auth session id, or null when the request presented a token. */
  sessionId: string | null;
  authKind: AuthKind;
  /** Set only for token auth: the id of the `access_tokens` row used. */
  tokenId: string | null;
}

interface TokenRow {
  id: string;
  user_id: string;
  expires_at: string | null;
  last_used_at: string | null;
  email: string;
  name: string;
}

/**
 * Resolve a personal access token to its owner, or null if it is unknown,
 * malformed, or expired. Deliberately opaque about which — an attacker probing
 * tokens learns only "no".
 */
async function userForToken(
  db: D1Database,
  token: string,
): Promise<{ user: AuthUser; tokenId: string } | null> {
  if (!isTokenShape(token)) return null;

  const row = await db
    .prepare(
      `SELECT t.id, t.user_id, t.expires_at, t.last_used_at, u.email, u.name
       FROM access_tokens t JOIN user u ON u.id = t.user_id
       WHERE t.token_hash = ?`,
    )
    .bind(await hashToken(token))
    .first<TokenRow>();

  if (!row) return null;

  const now = new Date();
  if (isExpired(row.expires_at, now)) return null;

  if (shouldTouchLastUsed(row.last_used_at, now)) {
    await db
      .prepare("UPDATE access_tokens SET last_used_at = ? WHERE id = ?")
      .bind(now.toISOString(), row.id)
      .run();
  }

  return {
    user: { id: row.user_id, email: row.email, name: row.name },
    tokenId: row.id,
  };
}

/**
 * Gate a route on a valid Better Auth session *or* a personal access token. On
 * success, `c.get("user")` and `c.get("authKind")` are populated; otherwise the
 * request 401s before the handler runs.
 *
 * This is the "auth" gate only — the separate crypto "unlock" gate (passphrase)
 * lives entirely on the client. That separation is what makes token auth safe
 * to add: a token buys access to ciphertext and plaintext names, never to
 * secret values.
 */
export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  const bearer = parseBearer(c.req.header("Authorization"));

  // A caller that presents a bearer is attempting token auth. Don't fall back
  // to cookies on failure: a bad token should fail as a bad token.
  if (bearer !== null) {
    const resolved = await userForToken(c.env.DB, bearer);
    if (!resolved) return c.json({ ok: false, error: "Unauthorized" }, 401);

    c.set("user", resolved.user);
    c.set("sessionId", null);
    c.set("authKind", "token");
    c.set("tokenId", resolved.tokenId);
    await next();
    return;
  }

  const result = await createAuth(c.env).api.getSession({
    headers: c.req.raw.headers,
  });

  if (!result) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }

  c.set("user", {
    id: result.user.id,
    email: result.user.email,
    name: result.user.name,
  });
  c.set("sessionId", result.session.id);
  c.set("authKind", "session");
  c.set("tokenId", null);

  await next();
});

/**
 * Narrow a route to browser sessions only, rejecting personal access tokens.
 * Applied on top of `requireAuth` (see index.ts).
 *
 * Least privilege for the CLI: a token needs to read key material and read and
 * write env blobs, and nothing else. In particular a token must never be able
 * to mint or revoke tokens — otherwise a leaked one is self-perpetuating and
 * revocation can be undone by the attacker — nor rewrite the key material that
 * the whole vault hangs from.
 */
export const requireSession = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  if (c.get("authKind") !== "session") {
    return c.json(
      { ok: false, error: "This action requires signing in to the web app" },
      403,
    );
  }
  await next();
});
