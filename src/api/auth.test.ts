import { env, SELF } from "cloudflare:test";
import { getAuthTables } from "better-auth/db";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import {
  createAuth,
  SESSION_EXPIRES_IN_SECONDS,
} from "./auth";

const DAY_MS = 24 * 60 * 60 * 1000;

async function seedUser(id: string) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, "Test", `${id}@test.dev`, 0, now, now)
    .run();
}

/** The signed cookie a browser would send back for this session token. */
async function sessionCookie(token: string): Promise<string> {
  const signature = await makeSignature(token, env.BETTER_AUTH_SECRET);
  // https baseURL, so Better Auth uses the __Secure- prefixed name.
  return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

// Phase 1 — auth gating. We can't complete the Google OAuth round-trip without
// real credentials + a browser, so we prove the two things that matter here:
// the auth handler is mounted and backed by the migrated schema, and protected
// routes reject unauthenticated requests.
describe("auth", () => {
  it("mounts Better Auth and can read the session table", async () => {
    // get-session with no cookies hits the `session` table and returns null —
    // a 200 here proves the handler is wired AND the auth migration applied.
    const res = await SELF.fetch("https://klef.test/api/auth/get-session");
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  // Regression for production OAuth breakage: Better Auth 1.7.0–1.7.2 required
  // `account.issuer` while our D1 migration (and 1.7.3) did not. Sign-in start
  // still worked; the callback died on account insert → internal_server_error.
  // Compare runtime expected columns to applied migrations so the next schema
  // bump fails CI before deploy.
  it("D1 schema matches Better Auth expected tables and columns", async () => {
    const tables = getAuthTables(createAuth(env).options);
    const missing: string[] = [];
    for (const [key, table] of Object.entries(tables)) {
      const name = table.modelName;
      const info = await env.DB.prepare(`PRAGMA table_info(${name})`).all<{
        name: string;
      }>();
      if (!info.results?.length) {
        missing.push(`table ${name} (${key})`);
        continue;
      }
      const cols = new Set(info.results.map((row) => row.name));
      // Core tables set fieldName; plugin schemas (passkey) often omit it and
      // use the object key as the column name.
      for (const [fieldKey, field] of Object.entries(table.fields)) {
        const col = field.fieldName ?? fieldKey;
        if (!cols.has(col)) {
          missing.push(`${name}.${col}`);
        }
      }
    }
    expect(
      missing,
      `Auth schema drift — run pnpm db:generate, apply migrations, then redeploy. Missing: ${missing.join(", ") || "(none)"}`,
    ).toEqual([]);
  });

  it("401s on a session-gated route without a session", async () => {
    const res = await SELF.fetch("https://klef.test/api/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Unauthorized" });
  });

  it("exposes Google as a configured social sign-in", async () => {
    // Requesting a Google sign-in URL should not 404/500; Better Auth returns a
    // redirect URL to Google's consent screen (proves the provider is wired).
    const res = await SELF.fetch("https://klef.test/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/" }),
    });
    expect(res.status).toBeLessThan(500);
    const body = (await res.json()) as { url?: string; redirect?: boolean };
    expect(typeof body.url).toBe("string");
    expect(body.url).toContain("accounts.google.com");
  });

  it("exposes GitHub as a configured social sign-in", async () => {
    const res = await SELF.fetch("https://klef.test/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "github", callbackURL: "/" }),
    });
    expect(res.status).toBeLessThan(500);
    const body = (await res.json()) as { url?: string; redirect?: boolean };
    expect(typeof body.url).toBe("string");
    expect(body.url).toContain("github.com");
  });

  it("rejects email/password sign-up (login is OAuth or passkey only)", async () => {
    const res = await SELF.fetch("https://klef.test/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Ada",
        email: "ada@example.com",
        password: "correct-horse-battery",
      }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  // A returning user on the same device should not be sent back to sign-in.
  // Better Auth's default lifetime is 7 days; Klef's is 30, and sliding.
  describe("session lifetime", () => {
    it("issues 30-day sessions", async () => {
      await seedUser("lifetime-user");
      const ctx = await createAuth(env).$context;
      const session = await ctx.internalAdapter.createSession("lifetime-user");
      const ttl = new Date(session.expiresAt).getTime() - Date.now();
      expect(ttl).toBeGreaterThan(29 * DAY_MS);
      expect(ttl).toBeLessThanOrEqual(SESSION_EXPIRES_IN_SECONDS * 1000);
    });

    it("slides the expiry forward when a day-old session is used", async () => {
      await seedUser("sliding-user");
      const ctx = await createAuth(env).$context;
      const session = await ctx.internalAdapter.createSession("sliding-user");
      // Pretend the session was last refreshed two days ago.
      const aged = new Date(Date.now() + SESSION_EXPIRES_IN_SECONDS * 1000 - 2 * DAY_MS);
      await env.DB.prepare("UPDATE session SET expiresAt = ? WHERE token = ?")
        .bind(aged.toISOString(), session.token)
        .run();

      const res = await SELF.fetch("https://klef.test/api/auth/get-session", {
        headers: { cookie: await sessionCookie(session.token) },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { user?: { id: string } } | null;
      expect(body?.user?.id).toBe("sliding-user");

      // The browser cookie is re-issued for the full window...
      const setCookie = res.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain(`Max-Age=${SESSION_EXPIRES_IN_SECONDS}`);
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/Secure/i);
      expect(setCookie).toMatch(/SameSite=Lax/i);
      // ...and the stored expiry moved forward with it.
      const row = await env.DB.prepare("SELECT expiresAt FROM session WHERE token = ?")
        .bind(session.token)
        .first<{ expiresAt: string }>();
      expect(new Date(row!.expiresAt).getTime()).toBeGreaterThan(aged.getTime() + DAY_MS);
    });
  });
});
