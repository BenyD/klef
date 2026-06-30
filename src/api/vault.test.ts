import { SELF, env } from "cloudflare:test";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { vault } from "./vault.ts";
import type { AuthVariables } from "./middleware.ts";

// Mount the vault routes behind a stub session so we can exercise CRUD against
// the real local D1 without completing an OAuth flow. The production auth gate
// is verified separately (the real app must 401).
function appForUser(userId: string) {
  const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: userId, email: `${userId}@test.dev`, name: "Test" });
    c.set("sessionId", "stub");
    await next();
  });
  app.route("/", vault);
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

const MATERIAL = {
  kdfParams: {
    id: "argon2id",
    memoryKiB: 19456,
    iterations: 2,
    parallelism: 1,
    hashLengthBytes: 32,
    salt: "c2FsdHNhbHQ=",
  },
  wrappedDek: { v: 1, alg: "AES-GCM", nonce: "bm9uY2Vub25j", ciphertext: "Y2lwaGVydGV4dA==" },
  wrappedDekRecovery: { v: 1, alg: "AES-GCM", nonce: "cmVjbm9uY2Vy", ciphertext: "cmVjY2lwaGVy" },
};

const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("vault routes", () => {
  it("the real app requires a session", async () => {
    for (const path of ["/api/vault", "/api/vault/passphrase"]) {
      const res = await SELF.fetch(`https://klef.test${path}`);
      expect(res.status).toBe(401);
    }
  });

  it("reports no vault, then creates and returns the material", async () => {
    await seedUser("u1");
    const app = appForUser("u1");

    expect(await (await app.request("/", {}, env)).json()).toEqual({ exists: false });

    const created = await app.request("/", json(MATERIAL), env);
    expect(created.status).toBe(201);

    const body = (await (await app.request("/", {}, env)).json()) as {
      exists: boolean;
      keyMaterial: typeof MATERIAL;
    };
    expect(body.exists).toBe(true);
    expect(body.keyMaterial.wrappedDek.ciphertext).toBe(MATERIAL.wrappedDek.ciphertext);
    expect(body.keyMaterial.kdfParams.salt).toBe(MATERIAL.kdfParams.salt);
  });

  it("rejects a second setup with 409", async () => {
    await seedUser("u2");
    const app = appForUser("u2");
    await app.request("/", json(MATERIAL), env);
    const dup = await app.request("/", json(MATERIAL), env);
    expect(dup.status).toBe(409);
  });

  it("rejects invalid key material with 400", async () => {
    await seedUser("u3");
    const res = await appForUser("u3").request("/", json({ nope: true }), env);
    expect(res.status).toBe(400);
  });

  it("re-wraps on passphrase change, leaving recovery untouched", async () => {
    await seedUser("u4");
    const app = appForUser("u4");
    await app.request("/", json(MATERIAL), env);

    const upd = await app.request(
      "/passphrase",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kdfParams: { ...MATERIAL.kdfParams, salt: "bmV3c2FsdG5ldw==" },
          wrappedDek: { ...MATERIAL.wrappedDek, ciphertext: "bmV3Y2lwaGVy" },
        }),
      },
      env,
    );
    expect(upd.status).toBe(200);

    const body = (await (await app.request("/", {}, env)).json()) as {
      keyMaterial: typeof MATERIAL;
    };
    expect(body.keyMaterial.kdfParams.salt).toBe("bmV3c2FsdG5ldw==");
    expect(body.keyMaterial.wrappedDek.ciphertext).toBe("bmV3Y2lwaGVy");
    // recovery-wrapped DEK is unchanged by a passphrase change.
    expect(body.keyMaterial.wrappedDekRecovery.ciphertext).toBe(
      MATERIAL.wrappedDekRecovery.ciphertext,
    );
  });

  it("isolates vaults per user", async () => {
    await seedUser("alice");
    await seedUser("bob");
    await appForUser("alice").request("/", json(MATERIAL), env);

    const bobView = await (await appForUser("bob").request("/", {}, env)).json();
    expect(bobView).toEqual({ exists: false });
  });
});
