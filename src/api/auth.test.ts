import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

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
});
