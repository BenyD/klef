import { createMiddleware } from "hono/factory";
import { createAuth } from "./auth.ts";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthVariables {
  user: AuthUser;
  sessionId: string;
}

/**
 * Gate a route on a valid Better Auth session. On success, `c.get("user")` and
 * `c.get("sessionId")` are populated; otherwise the request 401s before the
 * handler runs. This is the "auth" gate only — the separate crypto "unlock"
 * gate (passphrase) lives entirely in the browser.
 */
export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
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

  await next();
});
