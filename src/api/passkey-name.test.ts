import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { defaultPasskeyName } from "./passkey-name.ts";

const OPTIONS_URL =
  "https://klef.test/api/auth/passkey/generate-register-options";

// Passkey registration is session-only (added from settings); there is no
// passkey-first sign-up. Anonymous requests must be rejected outright.
describe("passkey registration options", () => {
  it("rejects anonymous requests", async () => {
    const res = await SELF.fetch(OPTIONS_URL);
    expect(res.status).toBe(401);
  });

  it("rejects the retired sign-up context without creating a user", async () => {
    const context = encodeURIComponent(
      JSON.stringify({ name: "Ada", email: "ada@example.com" }),
    );
    const res = await SELF.fetch(`${OPTIONS_URL}?context=${context}`);
    expect(res.status).toBe(401);

    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM user WHERE email = ?",
    )
      .bind("ada@example.com")
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
  });
});

describe("defaultPasskeyName", () => {
  const JUL_2026 = new Date("2026-07-11T12:00:00Z");

  it("labels a known provider with the month", () => {
    expect(
      defaultPasskeyName("bada5566-a7aa-401f-bd96-45619a55120d", JUL_2026),
    ).toBe("1Password · Jul 2026");
  });

  it("is case-insensitive on the AAGUID", () => {
    expect(
      defaultPasskeyName("BADA5566-A7AA-401F-BD96-45619A55120D", JUL_2026),
    ).toBe("1Password · Jul 2026");
  });

  it("returns null for unknown or missing AAGUIDs", () => {
    expect(defaultPasskeyName("00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(defaultPasskeyName(null)).toBeNull();
    expect(defaultPasskeyName(undefined)).toBeNull();
  });
});
