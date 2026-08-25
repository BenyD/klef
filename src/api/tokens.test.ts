import { SELF, env } from "cloudflare:test";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { MAX_TOKENS_PER_USER, tokens } from "./tokens.ts";
import { generateToken, hashToken, tokenDisplayPrefix } from "./access-token.ts";
import type { AuthVariables } from "./middleware.ts";
import type { AccessTokenSummary } from "../shared/api-types.ts";

// Mirrors the vault/structure test pattern: mount the routes behind a stub
// session so CRUD can run against real local D1. The production gates (auth,
// and session-only) are verified separately against the real app.
function appForUser(userId: string) {
  const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: userId, email: `${userId}@test.dev`, name: "Test" });
    c.set("sessionId", "stub");
    c.set("authKind", "session");
    c.set("tokenId", null);
    await next();
  });
  app.route("/", tokens);
  return app;
}

async function seedUser(id: string) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, "Test", `${id}@test.dev`, 0, now, now)
    .run();
}

/** Insert a token row directly, so middleware can be tested without the API. */
async function seedToken(
  userId: string,
  opts: { expiresAt?: string | null; lastUsedAt?: string | null } = {},
): Promise<string> {
  await seedUser(userId);
  const token = generateToken();
  await env.DB.prepare(
    `INSERT INTO access_tokens (id, user_id, name, token_hash, prefix, last_used_at, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      userId,
      "seeded",
      await hashToken(token),
      tokenDisplayPrefix(token),
      opts.lastUsedAt ?? null,
      opts.expiresAt ?? null,
      new Date().toISOString(),
    )
    .run();
  return token;
}

const post = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const bearer = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

describe("token routes", () => {
  it("creates a token, returns it exactly once, and lists it thereafter", async () => {
    await seedUser("t1");
    const app = appForUser("t1");

    const created = await app.request("/", post({ name: "laptop cli" }), env);
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      token: string;
      accessToken: AccessTokenSummary;
    };
    expect(body.token.startsWith("klef_pat_")).toBe(true);
    expect(body.accessToken.name).toBe("laptop cli");
    expect(body.accessToken.expiresAt).toBeNull();

    const listed = await app.request("/", undefined, env);
    const list = (await listed.json()) as { tokens: AccessTokenSummary[] };
    expect(list.tokens).toHaveLength(1);
    expect(list.tokens[0]?.prefix).toBe(body.accessToken.prefix);

    // The plaintext token must never be recoverable after creation.
    expect(JSON.stringify(list)).not.toContain(body.token);
  });

  it("stores only the hash, never the token", async () => {
    await seedUser("t2");
    const res = await appForUser("t2").request("/", post({ name: "cli" }), env);
    const { token } = (await res.json()) as { token: string };

    const row = await env.DB.prepare(
      "SELECT token_hash FROM access_tokens WHERE user_id = ?",
    )
      .bind("t2")
      .first<{ token_hash: string }>();

    expect(row?.token_hash).toBe(await hashToken(token));
    expect(row?.token_hash).not.toBe(token);
  });

  it("records an expiry when asked, and rejects nonsense ones", async () => {
    await seedUser("t3");
    const app = appForUser("t3");

    const ok = await app.request("/", post({ name: "ci", expiresInDays: 30 }), env);
    const { accessToken } = (await ok.json()) as { accessToken: AccessTokenSummary };
    expect(accessToken.expiresAt).not.toBeNull();
    expect(Date.parse(accessToken.expiresAt as string)).toBeGreaterThan(Date.now());

    for (const expiresInDays of [0, -1, 1.5, "30", 99999]) {
      const res = await app.request("/", post({ name: "bad", expiresInDays }), env);
      expect(res.status).toBe(400);
    }
  });

  it("rejects empty and oversized names", async () => {
    await seedUser("t4");
    const app = appForUser("t4");

    for (const name of ["", "   ", "x".repeat(101), 42, null]) {
      const res = await app.request("/", post({ name }), env);
      expect(res.status).toBe(400);
    }
  });

  it("caps how many tokens one account can hold", async () => {
    await seedUser("t5");
    const app = appForUser("t5");

    for (let i = 0; i < MAX_TOKENS_PER_USER; i++) {
      const res = await app.request("/", post({ name: `token ${i}` }), env);
      expect(res.status).toBe(201);
    }

    const overflow = await app.request("/", post({ name: "one too many" }), env);
    expect(overflow.status).toBe(409);
  });

  it("revokes a token, and won't revoke someone else's", async () => {
    await seedUser("t6");
    await seedUser("t7");
    const mine = await appForUser("t6").request("/", post({ name: "mine" }), env);
    const { accessToken } = (await mine.json()) as { accessToken: AccessTokenSummary };

    const stranger = await appForUser("t7").request(
      `/${accessToken.id}`,
      { method: "DELETE" },
      env,
    );
    expect(stranger.status).toBe(404);

    const owner = await appForUser("t6").request(
      `/${accessToken.id}`,
      { method: "DELETE" },
      env,
    );
    expect(owner.status).toBe(200);

    const after = await appForUser("t6").request("/", undefined, env);
    expect(((await after.json()) as { tokens: unknown[] }).tokens).toHaveLength(0);
  });
});

describe("token authentication", () => {
  it("authenticates a real request with a bearer token", async () => {
    const token = await seedToken("auth1");

    const res = await SELF.fetch("https://klef.test/api/me", bearer(token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string } };
    expect(body.user.id).toBe("auth1");
  });

  it("rejects unknown, malformed, and foreign bearer tokens", async () => {
    await seedToken("auth2");

    for (const value of [
      generateToken(), // well-formed but never issued
      "klef_pat_short",
      "github_pat_11ABCDE",
      "",
    ]) {
      const res = await SELF.fetch("https://klef.test/api/me", {
        headers: { Authorization: `Bearer ${value}` },
      });
      expect(res.status).toBe(401);
    }
  });

  it("rejects an expired token", async () => {
    const expired = await seedToken("auth3", {
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const live = await seedToken("auth4", {
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    expect((await SELF.fetch("https://klef.test/api/me", bearer(expired))).status).toBe(401);
    expect((await SELF.fetch("https://klef.test/api/me", bearer(live))).status).toBe(200);
  });

  it("stops working the moment it is revoked", async () => {
    const token = await seedToken("auth5");
    expect((await SELF.fetch("https://klef.test/api/me", bearer(token))).status).toBe(200);

    await env.DB.prepare("DELETE FROM access_tokens WHERE token_hash = ?")
      .bind(await hashToken(token))
      .run();

    expect((await SELF.fetch("https://klef.test/api/me", bearer(token))).status).toBe(401);
  });

  it("records first use, then throttles further writes", async () => {
    const token = await seedToken("auth6");
    const lastUsed = async () =>
      (
        await env.DB.prepare(
          "SELECT last_used_at FROM access_tokens WHERE user_id = ?",
        )
          .bind("auth6")
          .first<{ last_used_at: string | null }>()
      )?.last_used_at ?? null;

    expect(await lastUsed()).toBeNull();
    await SELF.fetch("https://klef.test/api/me", bearer(token));
    const first = await lastUsed();
    expect(first).not.toBeNull();

    await SELF.fetch("https://klef.test/api/me", bearer(token));
    expect(await lastUsed()).toBe(first);
  });

  it("dies with its owner", async () => {
    const token = await seedToken("auth7");
    await env.DB.prepare("DELETE FROM user WHERE id = ?").bind("auth7").run();

    expect((await SELF.fetch("https://klef.test/api/me", bearer(token))).status).toBe(401);
  });
});

// The least-privilege boundary. A token buys read access to ciphertext and the
// ability to add versions — never the power to reshape the account, destroy
// data, or perpetuate itself.
describe("what a token may not do", () => {
  it("can read vault key material, because the CLI unlocks locally", async () => {
    const token = await seedToken("cap1");
    const res = await SELF.fetch("https://klef.test/api/vault", bearer(token));
    expect(res.status).toBe(200);
  });

  it("can read the navigation tree", async () => {
    const token = await seedToken("cap2");
    const res = await SELF.fetch("https://klef.test/api/tree", bearer(token));
    expect(res.status).toBe(200);
  });

  it("cannot mint or revoke tokens", async () => {
    const token = await seedToken("cap3");

    const list = await SELF.fetch("https://klef.test/api/tokens", bearer(token));
    expect(list.status).toBe(403);

    const mint = await SELF.fetch("https://klef.test/api/tokens", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "self-perpetuating" }),
    });
    expect(mint.status).toBe(403);

    const revoke = await SELF.fetch("https://klef.test/api/tokens/whatever", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(revoke.status).toBe(403);
  });

  it("cannot rewrite the vault's key material", async () => {
    const token = await seedToken("cap4");

    for (const [method, path] of [
      ["POST", "/api/vault"],
      ["PUT", "/api/vault/passphrase"],
      ["PUT", "/api/vault/recovery"],
      ["PUT", "/api/vault/passkey"],
      ["DELETE", "/api/vault/passkey/some-id"],
      ["POST", "/api/vault/recovery-confirmed"],
    ] as const) {
      const res = await SELF.fetch(`https://klef.test${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: method === "DELETE" ? undefined : "{}",
      });
      // 403, not 401 — proves auth succeeded and the session-only gate refused.
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it("cannot delete workspaces, projects, or files", async () => {
    const token = await seedToken("cap5");

    for (const path of [
      "/api/workspaces/some-id",
      "/api/projects/some-id",
      "/api/files/some-id",
    ]) {
      const res = await SELF.fetch(`https://klef.test${path}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status, path).toBe(403);
    }
  });
});

describe("token management routes", () => {
  it("the real app requires auth", async () => {
    const res = await SELF.fetch("https://klef.test/api/tokens");
    expect(res.status).toBe(401);
  });
});
