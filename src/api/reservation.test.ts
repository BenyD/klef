import { SELF, env } from "cloudflare:test";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { reservation } from "./reservation.ts";
import type { AuthVariables } from "./middleware.ts";
import type { PlanReservation } from "../shared/api-types.ts";

// Same pattern as tokens.test.ts: the routes behind a stub session against
// real local D1, and the production gates checked against the real app.
function appForUser(userId: string) {
  const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: userId, email: `${userId}@test.dev`, name: "Test" });
    c.set("sessionId", "stub");
    c.set("authKind", "session");
    c.set("tokenId", null);
    await next();
  });
  app.route("/", reservation);
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

const put = (body: unknown) => ({
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

type Body = { reservation: PlanReservation | null };

describe("reservation routes", () => {
  it("starts with no reservation", async () => {
    await seedUser("r1");
    const res = await appForUser("r1").request("/", {}, env);
    expect(res.status).toBe(200);
    expect(((await res.json()) as Body).reservation).toBeNull();
  });

  it("reserves a plan and reads it back", async () => {
    await seedUser("r2");
    const app = appForUser("r2");
    const res = await app.request("/", put({ plan: "hosted" }), env);
    expect(res.status).toBe(200);
    const made = ((await res.json()) as Body).reservation;
    expect(made?.plan).toBe("hosted");
    expect(made?.createdAt).toBe(made?.updatedAt);

    const read = ((await (await app.request("/", {}, env)).json()) as Body).reservation;
    expect(read).toEqual(made);
  });

  it("switching plans keeps the original reservation time", async () => {
    await seedUser("r3");
    const app = appForUser("r3");
    const first = ((await (await app.request("/", put({ plan: "hosted" }), env)).json()) as Body)
      .reservation!;
    await new Promise((r) => setTimeout(r, 5));
    const second = ((await (await app.request("/", put({ plan: "kit" }), env)).json()) as Body)
      .reservation!;
    expect(second.plan).toBe("kit");
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt > first.updatedAt).toBe(true);
  });

  it("rejects anything but a reservable plan", async () => {
    await seedUser("r4");
    const app = appForUser("r4");
    for (const body of [{ plan: "free" }, { plan: "team" }, { plan: "lifetime" }, {}, "hosted"]) {
      const res = await app.request("/", put(body), env);
      expect(res.status).toBe(400);
    }
    const bad = await app.request(
      "/",
      { method: "PUT", headers: { "content-type": "application/json" }, body: "{not json" },
      env,
    );
    expect(bad.status).toBe(400);
    expect(((await (await app.request("/", {}, env)).json()) as Body).reservation).toBeNull();
  });

  it("cancels a reservation", async () => {
    await seedUser("r5");
    const app = appForUser("r5");
    await app.request("/", put({ plan: "hosted" }), env);
    const res = await app.request("/", { method: "DELETE" }, env);
    expect(res.status).toBe(200);
    expect(((await (await app.request("/", {}, env)).json()) as Body).reservation).toBeNull();
  });

  it("keeps each person's reservation to themselves", async () => {
    await seedUser("r6");
    await seedUser("r7");
    await appForUser("r6").request("/", put({ plan: "hosted" }), env);
    const other = await appForUser("r7").request("/", {}, env);
    expect(((await other.json()) as Body).reservation).toBeNull();
  });
});

describe("reservation gates on the real app", () => {
  it("requires a session", async () => {
    const res = await SELF.fetch("https://klef.test/api/reservation");
    expect(res.status).toBe(401);
    const write = await SELF.fetch("https://klef.test/api/reservation", put({ plan: "hosted" }));
    expect(write.status).toBe(401);
  });
});
