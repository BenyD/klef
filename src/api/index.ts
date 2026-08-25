import { Hono } from "hono";
import { createAuth } from "./auth.ts";
import { requireAuth, requireSession, type AuthVariables } from "./middleware.ts";
import { vault } from "./vault.ts";
import { structure } from "./structure.ts";
import { icon } from "./icon.ts";
import { tokens } from "./tokens.ts";

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
// Tokens may *read* key material — the CLI needs the wrapped DEK to unlock
// locally — but may not write it. Scoping to the mutating methods (rather than
// a path list) keeps this deny-by-default: a vault route added later is
// browser-only from the moment it exists, without anyone remembering to gate it.
// Note `/api/vault/*` also matches the bare `/api/vault`, so GET must not be
// listed here.
app.on(
  ["POST", "PUT", "PATCH", "DELETE"],
  ["/api/vault", "/api/vault/*"],
  requireSession,
);
app.route("/api/vault", vault);

// Navigation structure (workspaces / projects / env files). Gate each resource
// prefix (not all of /api, so unknown paths still hit the 404 below); the route
// module itself is auth-free so it can be unit-tested with a stub session.
for (const prefix of ["/api/tree", "/api/workspaces", "/api/projects", "/api/files"]) {
  app.use(prefix, requireAuth);
  app.use(`${prefix}/*`, requireAuth);
}
// Deleting workspaces, projects, or files stays browser-only. Nothing in the
// CLI or MCP surface needs it, and a leaked token should not be able to
// destroy data — only to read and add versions.
for (const prefix of ["/api/workspaces", "/api/projects", "/api/files"]) {
  app.on("DELETE", `${prefix}/:id`, requireSession);
}
app.route("/api", structure);

// Personal access tokens for the CLI and MCP server. Session-only by design: a
// token that could mint or revoke tokens would survive its own revocation.
app.use("/api/tokens", requireAuth, requireSession);
app.use("/api/tokens/*", requireAuth, requireSession);
app.route("/api/tokens", tokens);

// Favicon discovery for project icons (server-side because of CORS).
app.use("/api/icon", requireAuth);
app.route("/api/icon", icon);

// Any other /api path we haven't defined.
app.all("/api/*", (c) => c.json({ ok: false, error: "Not found" }, 404));

// Agent/crawler discovery probes (routed here via run_worker_first) get an
// honest 404 instead of the SPA shell, which scanners read as a soft-404.
app.all("/.well-known/*", (c) => c.json({ ok: false, error: "Not found" }, 404));

export default app;
