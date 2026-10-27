import { env, SELF } from "cloudflare:test";
import app from "./index.ts";
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

// "/" runs the Worker first (run_worker_first) so it can serve the
// prerendered landing from home.html; index.html stays the bare app shell.
describe("worker /", () => {
  const assets = (pages: Record<string, string>) =>
    ({
      fetch: async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : input);
        const body = pages[url.pathname];
        return body === undefined
          ? new Response("not found", { status: 404 })
          : new Response(body, { headers: { "content-type": "text/html" } });
      },
    }) as unknown as Fetcher;

  it("serves home.html for the landing page", async () => {
    const res = await app.request("/", {}, {
      ...env,
      ASSETS: assets({ "/home": "landing", "/": "shell" }),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("landing");
  });

  it("falls back to the assets' own / when there is no home.html", async () => {
    const res = await app.request("/", {}, { ...env, ASSETS: assets({ "/": "shell" }) });
    expect(await res.text()).toBe("shell");
  });
});
