import { Hono } from "hono";
import { createAuth } from "./auth.ts";
import { requireAuth, type AuthVariables } from "./middleware.ts";
import { vault } from "./vault.ts";
import { structure } from "./structure.ts";

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

// Vault key material (wrapped DEKs + KDF params). Gated here so the route
// module can be unit-tested with a stub session; both the bare path and
// subpaths require auth.
app.use("/api/vault", requireAuth);
app.use("/api/vault/*", requireAuth);
app.route("/api/vault", vault);

// Navigation structure (workspaces / projects / env files). Gate each resource
// prefix (not all of /api, so unknown paths still hit the 404 below); the route
// module itself is auth-free so it can be unit-tested with a stub session.
for (const prefix of ["/api/tree", "/api/workspaces", "/api/projects", "/api/files"]) {
  app.use(prefix, requireAuth);
  app.use(`${prefix}/*`, requireAuth);
}
app.route("/api", structure);

// Any other /api path we haven't defined.
app.all("/api/*", (c) => c.json({ ok: false, error: "Not found" }, 404));

// Agent/crawler discovery probes (routed here via run_worker_first) get an
// honest 404 instead of the SPA shell, which scanners read as a soft-404.
app.all("/.well-known/*", (c) => c.json({ ok: false, error: "Not found" }, 404));

export default app;
