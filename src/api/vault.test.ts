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

  it("seeds a default workspace named after the user on first setup", async () => {
    await seedUser("u-seed");
    const app = appForUser("u-seed");
    await app.request("/", json(MATERIAL), env);

    const row = await env.DB.prepare(
      "SELECT name FROM workspaces WHERE user_id = ?",
    )
      .bind("u-seed")
      .first<{ name: string }>();
    // Stub session name is "Test", so the starter workspace is "Test's Team".
    expect(row?.name).toBe("Test's Team");
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

  it("replaces only the recovery-wrapped DEK on rotation", async () => {
    await seedUser("u5");
    const app = appForUser("u5");
    await app.request("/", json(MATERIAL), env);

    const upd = await app.request(
      "/recovery",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wrappedDekRecovery: {
            ...MATERIAL.wrappedDekRecovery,
            ciphertext: "cm90YXRlZHJlYw==",
          },
        }),
      },
      env,
    );
    expect(upd.status).toBe(200);

    const body = (await (await app.request("/", {}, env)).json()) as {
      keyMaterial: typeof MATERIAL;
    };
    expect(body.keyMaterial.wrappedDekRecovery.ciphertext).toBe("cm90YXRlZHJlYw==");
    // Passphrase wrapping and KDF params are unchanged by a rotation.
    expect(body.keyMaterial.wrappedDek.ciphertext).toBe(MATERIAL.wrappedDek.ciphertext);
    expect(body.keyMaterial.kdfParams.salt).toBe(MATERIAL.kdfParams.salt);
  });

  it("rejects invalid or vault-less recovery rotations", async () => {
    await seedUser("u6");
    const app = appForUser("u6");

    // No vault yet.
    const missing = await app.request(
      "/recovery",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wrappedDekRecovery: MATERIAL.wrappedDekRecovery }),
      },
      env,
    );
    expect(missing.status).toBe(404);

    await app.request("/", json(MATERIAL), env);
    const bad = await app.request(
      "/recovery",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wrappedDekRecovery: { nope: true } }),
      },
      env,
    );
    expect(bad.status).toBe(400);
  });

  it("isolates vaults per user", async () => {
    await seedUser("alice");
    await seedUser("bob");
    await appForUser("alice").request("/", json(MATERIAL), env);

    const bobView = await (await appForUser("bob").request("/", {}, env)).json();
    expect(bobView).toEqual({ exists: false });
  });

  it("tracks recovery confirmation: unset, explicit confirm, and via rotation", async () => {
    await seedUser("u-rec1");
    const app = appForUser("u-rec1");
    await app.request("/", json(MATERIAL), env);

    // Fresh vault: never confirmed.
    let view = (await (await app.request("/", {}, env)).json()) as {
      recoveryConfirmedAt: string | null;
    };
    expect(view.recoveryConfirmedAt).toBeNull();

    // The setup checkbox posts an explicit confirmation.
    const confirmed = await app.request(
      "/recovery-confirmed",
      { method: "POST" },
      env,
    );
    expect(confirmed.status).toBe(200);
    view = (await (await app.request("/", {}, env)).json()) as {
      recoveryConfirmedAt: string | null;
    };
    expect(view.recoveryConfirmedAt).toBeTruthy();
  });

  it("rotation stamps recovery confirmation on the same write", async () => {
    await seedUser("u-rec2");
    const app = appForUser("u-rec2");
    await app.request("/", json(MATERIAL), env);

    const rotated = await app.request(
      "/recovery",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wrappedDekRecovery: MATERIAL.wrappedDekRecovery }),
      },
      env,
    );
    expect(rotated.status).toBe(200);

    const view = (await (await app.request("/", {}, env)).json()) as {
      recoveryConfirmedAt: string | null;
    };
    expect(view.recoveryConfirmedAt).toBeTruthy();
  });

  it("confirming without a vault is a 404", async () => {
    await seedUser("u-rec3");
    const res = await appForUser("u-rec3").request(
      "/recovery-confirmed",
      { method: "POST" },
      env,
    );
    expect(res.status).toBe(404);
  });
});

// --- passkey unlock wraps ----------------------------------------------------

async function seedPasskey(id: string, userId: string, credentialId: string) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO passkey (id, name, publicKey, "userId", "credentialID", counter, deviceType, backedUp, createdAt)
     VALUES (?, ?, ?, ?, ?, 0, 'singleDevice', 0, ?)`,
  )
    .bind(id, "Test key", "pk", userId, credentialId, new Date().toISOString())
    .run();
}

const PASSKEY_WRAP = {
  prfSalt: "cHJmc2FsdHByZnNhbHQ=",
  wrappedDek: { v: 1, alg: "AES-GCM", nonce: "cGtub25jZXBr", ciphertext: "cGtjaXBoZXI=" },
};

describe("vault passkey routes", () => {
  const put = (body: unknown) => ({
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  it("rejects enrollment without a vault", async () => {
    await seedUser("pk-novault");
    await seedPasskey("pk-nv-1", "pk-novault", "cred-nv-1");
    const app = appForUser("pk-novault");
    const res = await app.request(
      "/passkey",
      put({ passkeyId: "pk-nv-1", credentialId: "cred-nv-1", ...PASSKEY_WRAP }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("rejects a passkey the user does not own or a mismatched credential", async () => {
    await seedUser("pk-owner");
    await seedUser("pk-thief");
    await seedPasskey("pk-o-1", "pk-owner", "cred-o-1");
    const owner = appForUser("pk-owner");
    const thief = appForUser("pk-thief");
    await owner.request("/", json(MATERIAL), env);
    await thief.request("/", json(MATERIAL), env);

    const stolen = await thief.request(
      "/passkey",
      put({ passkeyId: "pk-o-1", credentialId: "cred-o-1", ...PASSKEY_WRAP }),
      env,
    );
    expect(stolen.status).toBe(404);

    const mismatched = await owner.request(
      "/passkey",
      put({ passkeyId: "pk-o-1", credentialId: "cred-other", ...PASSKEY_WRAP }),
      env,
    );
    expect(mismatched.status).toBe(404);
  });

  it("enrolls, returns the wrap from GET, and upserts on re-enroll", async () => {
    await seedUser("pk-u1");
    await seedPasskey("pk-1", "pk-u1", "cred-1");
    const app = appForUser("pk-u1");
    await app.request("/", json(MATERIAL), env);

    const enrolled = await app.request(
      "/passkey",
      put({ passkeyId: "pk-1", credentialId: "cred-1", ...PASSKEY_WRAP }),
      env,
    );
    expect(enrolled.status).toBe(200);

    let body = (await (await app.request("/", {}, env)).json()) as {
      passkeyWraps: Array<{ passkeyId: string; credentialId: string; prfSalt: string }>;
    };
    expect(body.passkeyWraps).toHaveLength(1);
    expect(body.passkeyWraps[0]).toMatchObject({
      passkeyId: "pk-1",
      credentialId: "cred-1",
      prfSalt: PASSKEY_WRAP.prfSalt,
    });

    const rewrap = await app.request(
      "/passkey",
      put({
        passkeyId: "pk-1",
        credentialId: "cred-1",
        ...PASSKEY_WRAP,
        prfSalt: "bmV3c2FsdG5ld3NhbHQ=",
      }),
      env,
    );
    expect(rewrap.status).toBe(200);

    body = (await (await app.request("/", {}, env)).json()) as typeof body;
    expect(body.passkeyWraps).toHaveLength(1);
    expect(body.passkeyWraps[0]!.prfSalt).toBe("bmV3c2FsdG5ld3NhbHQ=");
  });

  it("removes a wrap and 404s when nothing is enrolled", async () => {
    await seedUser("pk-u2");
    await seedPasskey("pk-2", "pk-u2", "cred-2");
    const app = appForUser("pk-u2");
    await app.request("/", json(MATERIAL), env);
    await app.request(
      "/passkey",
      put({ passkeyId: "pk-2", credentialId: "cred-2", ...PASSKEY_WRAP }),
      env,
    );

    const removed = await app.request("/passkey/pk-2", { method: "DELETE" }, env);
    expect(removed.status).toBe(200);

    const body = (await (await app.request("/", {}, env)).json()) as {
      passkeyWraps: unknown[];
    };
    expect(body.passkeyWraps).toHaveLength(0);

    const again = await app.request("/passkey/pk-2", { method: "DELETE" }, env);
    expect(again.status).toBe(404);
  });

  it("drops the wrap when the passkey row is deleted (FK cascade)", async () => {
    await seedUser("pk-u3");
    await seedPasskey("pk-3", "pk-u3", "cred-3");
    const app = appForUser("pk-u3");
    await app.request("/", json(MATERIAL), env);
    await app.request(
      "/passkey",
      put({ passkeyId: "pk-3", credentialId: "cred-3", ...PASSKEY_WRAP }),
      env,
    );

    await env.DB.prepare("DELETE FROM passkey WHERE id = ?").bind("pk-3").run();

    const body = (await (await app.request("/", {}, env)).json()) as {
      passkeyWraps: unknown[];
    };
    expect(body.passkeyWraps).toHaveLength(0);
  });
});
