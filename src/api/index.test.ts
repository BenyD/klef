import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// Worker integration test — runs inside workerd against a real local D1 with
// our migrations applied (see test/apply-migrations.ts).
describe("worker /api", () => {
  it("health route reports SPA→Worker→D1 connectivity", async () => {
    const res = await SELF.fetch("https://klef.test/api/health");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      ok: boolean;
      service: string;
      db: { reachable: boolean; healthChecks: number };
    };

    expect(body.ok).toBe(true);
    expect(body.service).toBe("klef");
    expect(body.db.reachable).toBe(true);
    // health_check table exists (migration applied) → count is a number.
    expect(typeof body.db.healthChecks).toBe("number");
  });

  it("unknown /api routes 404 as JSON", async () => {
    const res = await SELF.fetch("https://klef.test/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "Not found" });
  });
});
