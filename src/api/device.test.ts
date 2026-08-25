import { SELF, env } from "cloudflare:test";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { device } from "./device.ts";
import { hashToken } from "./access-token.ts";
import type { AuthVariables } from "./middleware.ts";
import {
  generateSealKeypair,
  openToken,
  type SealedToken,
} from "../shared/device-seal.ts";
import { generateDeviceCode } from "../shared/device-code.ts";
import { bytesToBase64, utf8ToBytes } from "../shared/encoding.ts";

// Approve is mounted behind a session (index.ts), so it is exercised here
// through a stub the way the vault and structure routes are. The gates
// themselves are checked against the real app further down.
function appForUser(userId: string) {
  const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: userId, email: `${userId}@test.dev`, name: "Test" });
    c.set("sessionId", "stub");
    c.set("authKind", "session");
    c.set("tokenId", null);
    await next();
  });
  app.route("/", device);
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

const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

interface StartResult {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
}

async function start(app: ReturnType<typeof appForUser>, label = "macOS") {
  const { publicJwk, privateKey } = await generateSealKeypair();
  const res = await app.request("/", json({ label, publicJwk }), env);
  expect(res.status).toBe(200);
  return { ...((await res.json()) as StartResult), privateKey };
}

describe("starting a login", () => {
  it("returns both codes and where to go", async () => {
    const started = await start(appForUser("d1"));
    expect(started.deviceCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(started.userCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(started.verificationUri).toContain("/cli");
    expect(started.expiresIn).toBeGreaterThan(0);
  });

  it("stores only the hash of the device code", async () => {
    const started = await start(appForUser("d2"));
    const row = await env.DB.prepare(
      "SELECT device_hash FROM device_authorizations WHERE user_code = ?",
    )
      .bind(started.userCode)
      .first<{ device_hash: string }>();

    expect(row?.device_hash).not.toBe(started.deviceCode);
    expect(row?.device_hash).toBe(
      bytesToBase64(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", utf8ToBytes(started.deviceCode)),
        ),
      ),
    );
  });

  it("refuses to start without a key to seal to", async () => {
    const app = appForUser("d3");
    for (const publicJwk of [undefined, null, "nope", { kty: "RSA" }]) {
      const res = await app.request("/", json({ label: "x", publicJwk }), env);
      expect(res.status).toBe(400);
    }
  });

  it("strips a label before it reaches the approval page", async () => {
    const { publicJwk } = await generateSealKeypair();
    const res = await appForUser("d4").request(
      "/",
      json({ label: "<script>alert(1)</script>", publicJwk }),
      env,
    );
    const { userCode } = (await res.json()) as StartResult;
    const row = await env.DB.prepare(
      "SELECT label FROM device_authorizations WHERE user_code = ?",
    )
      .bind(userCode)
      .first<{ label: string }>();
    expect(row?.label).not.toContain("<");
    expect(row?.label).not.toContain(">");
  });
});

describe("polling", () => {
  it("reports pending until approved", async () => {
    const app = appForUser("p1");
    const started = await start(app);
    const res = await app.request("/token", json({ deviceCode: started.deviceCode }), env);
    expect(res.status).toBe(428);
    expect(((await res.json()) as { status: string }).status).toBe("pending");
  });

  it("gives the same answer for unknown and expired codes", async () => {
    const app = appForUser("p2");
    const unknown = await app.request("/token", json({ deviceCode: generateDeviceCode() }), env);
    expect(unknown.status).toBe(410);
    expect(((await unknown.json()) as { status: string }).status).toBe("expired");

    const started = await start(app);
    await env.DB.prepare(
      "UPDATE device_authorizations SET expires_at = ? WHERE user_code = ?",
    )
      .bind(new Date(Date.now() - 1000).toISOString(), started.userCode)
      .run();
    const stale = await app.request("/token", json({ deviceCode: started.deviceCode }), env);
    expect(stale.status).toBe(410);
  });

  it("rejects a malformed device code without a lookup", async () => {
    const res = await appForUser("p3").request("/token", json({ deviceCode: "short" }), env);
    expect(res.status).toBe(400);
  });
});

describe("approving", () => {
  it("mints a token the CLI can open and the server cannot", async () => {
    await seedUser("a1");
    const app = appForUser("a1");
    const started = await start(app);

    const approved = await app.request("/approve", json({ userCode: started.userCode }), env);
    expect(approved.status).toBe(200);

    // The row must not be a usable credential while it waits.
    const stored = await env.DB.prepare(
      "SELECT token_sealed FROM device_authorizations WHERE user_code = ?",
    )
      .bind(started.userCode)
      .first<{ token_sealed: string }>();
    expect(stored?.token_sealed).toBeTruthy();

    const polled = await app.request("/token", json({ deviceCode: started.deviceCode }), env);
    expect(polled.status).toBe(200);
    const { sealedToken } = (await polled.json()) as { sealedToken: SealedToken };

    const token = await openToken(started.privateKey, sealedToken);
    expect(token.startsWith("klef_pat_")).toBe(true);
    // What the server kept is the hash, not the token.
    expect(stored!.token_sealed).not.toContain(token);

    const row = await env.DB.prepare(
      "SELECT user_id FROM access_tokens WHERE token_hash = ?",
    )
      .bind(await hashToken(token))
      .first<{ user_id: string }>();
    expect(row?.user_id).toBe("a1");
  });

  it("hands the token over exactly once", async () => {
    await seedUser("a2");
    const app = appForUser("a2");
    const started = await start(app);
    await app.request("/approve", json({ userCode: started.userCode }), env);

    const first = await app.request("/token", json({ deviceCode: started.deviceCode }), env);
    expect(first.status).toBe(200);
    const second = await app.request("/token", json({ deviceCode: started.deviceCode }), env);
    expect(second.status).toBe(428);
  });

  it("accepts the code however the user typed it", async () => {
    await seedUser("a3");
    const app = appForUser("a3");
    const started = await start(app);
    const typed = started.userCode.toLowerCase().replace("-", "");
    expect((await app.request("/approve", json({ userCode: typed }), env)).status).toBe(200);
  });

  it("refuses a second decision on the same code", async () => {
    await seedUser("a4");
    const app = appForUser("a4");
    const started = await start(app);
    await app.request("/approve", json({ userCode: started.userCode }), env);
    const again = await app.request("/approve", json({ userCode: started.userCode }), env);
    expect(again.status).toBe(409);
  });

  it("denies without minting anything", async () => {
    await seedUser("a5");
    const app = appForUser("a5");
    const started = await start(app);
    expect(
      (await app.request("/approve", json({ userCode: started.userCode, deny: true }), env))
        .status,
    ).toBe(200);

    const polled = await app.request("/token", json({ deviceCode: started.deviceCode }), env);
    expect(polled.status).toBe(403);

    const minted = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM access_tokens WHERE user_id = 'a5'",
    ).first<{ n: number }>();
    expect(minted?.n).toBe(0);
  });

  it("refuses an expired code", async () => {
    await seedUser("a6");
    const app = appForUser("a6");
    const started = await start(app);
    await env.DB.prepare(
      "UPDATE device_authorizations SET expires_at = ? WHERE user_code = ?",
    )
      .bind(new Date(Date.now() - 1000).toISOString(), started.userCode)
      .run();
    expect(
      (await app.request("/approve", json({ userCode: started.userCode }), env)).status,
    ).toBe(404);
  });
});

// The gate that matters: a leaked access token must not be able to authorise
// its own successors.
describe("the real app's gates", () => {
  it("lets anyone start a login and poll, since the CLI has no credentials yet", async () => {
    const { publicJwk } = await generateSealKeypair();
    const started = await SELF.fetch(
      "https://klef.test/api/cli/device",
      json({ label: "macOS", publicJwk }),
    );
    expect(started.status).toBe(200);
    const { deviceCode } = (await started.json()) as StartResult;

    const polled = await SELF.fetch(
      "https://klef.test/api/cli/device/token",
      json({ deviceCode }),
    );
    expect(polled.status).toBe(428);
  });

  it("requires a session to approve, deny, or read a pending request", async () => {
    for (const [path, init] of [
      ["/api/cli/device/approve", json({ userCode: "ABCD-EFGH" })],
      ["/api/cli/device/pending/ABCD-EFGH", undefined],
    ] as const) {
      const res = await SELF.fetch(`https://klef.test${path}`, init);
      expect(res.status, path).toBe(401);
    }
  });
});
