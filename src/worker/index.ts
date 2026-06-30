import { Hono } from "hono";
import { createAuth } from "./auth.ts";
import { requireAuth, type AuthVariables } from "./middleware.ts";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// Better Auth owns every /api/auth/* route: Google OAuth, session, passkey, etc.
// Instantiated per request because the D1 binding comes from `c.env`.
app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

// Smoke route: proves SPA -> Worker -> D1 connectivity.
app.get("/api/health", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM health_check",
  ).first<{ n: number }>();

  return c.json({
    ok: true,
    service: "klef",
    db: { reachable: true, healthChecks: row?.n ?? 0 },
    time: new Date().toISOString(),
  });
});

// Session-gated route — the canonical "API gates on session" example.
app.get("/api/me", requireAuth, (c) =>
  c.json({ ok: true, user: c.get("user") }),
);

// Any other /api path we haven't defined.
app.all("/api/*", (c) => c.json({ ok: false, error: "Not found" }, 404));

export default app;
