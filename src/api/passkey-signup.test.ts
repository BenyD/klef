import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  defaultPasskeyName,
  parsePasskeySignupContext,
} from "./passkey-signup.ts";

describe("parsePasskeySignupContext", () => {
  it("parses a valid sign-up context, trimming and lowercasing", () => {
    const context = JSON.stringify({ name: "  Ada Lovelace ", email: " Ada@Example.COM " });
    expect(parsePasskeySignupContext(context)).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
    });
  });

  it("rejects absent or malformed input", () => {
    expect(parsePasskeySignupContext(null)).toBeNull();
    expect(parsePasskeySignupContext(undefined)).toBeNull();
    expect(parsePasskeySignupContext("")).toBeNull();
    expect(parsePasskeySignupContext("not json")).toBeNull();
    expect(parsePasskeySignupContext('"a string"')).toBeNull();
    expect(parsePasskeySignupContext("[1,2]")).toBeNull();
  });

  it("rejects missing or non-string fields", () => {
    expect(parsePasskeySignupContext(JSON.stringify({ email: "a@b.co" }))).toBeNull();
    expect(parsePasskeySignupContext(JSON.stringify({ name: "Ada" }))).toBeNull();
    expect(
      parsePasskeySignupContext(JSON.stringify({ name: 42, email: "a@b.co" })),
    ).toBeNull();
    expect(
      parsePasskeySignupContext(JSON.stringify({ name: "Ada", email: {} })),
    ).toBeNull();
  });

  it("rejects blank names and invalid emails", () => {
    expect(
      parsePasskeySignupContext(JSON.stringify({ name: "   ", email: "a@b.co" })),
    ).toBeNull();
    expect(
      parsePasskeySignupContext(JSON.stringify({ name: "Ada", email: "nope" })),
    ).toBeNull();
    expect(
      parsePasskeySignupContext(JSON.stringify({ name: "Ada", email: "a b@c.co" })),
    ).toBeNull();
  });

  it("rejects oversized fields", () => {
    expect(
      parsePasskeySignupContext(
        JSON.stringify({ name: "x".repeat(201), email: "a@b.co" }),
      ),
    ).toBeNull();
    expect(
      parsePasskeySignupContext(
        JSON.stringify({ name: "Ada", email: `${"x".repeat(250)}@b.co` }),
      ),
    ).toBeNull();
  });
});

const OPTIONS_URL =
  "https://klef.test/api/auth/passkey/generate-register-options";

function optionsUrl(context: unknown) {
  return `${OPTIONS_URL}?context=${encodeURIComponent(JSON.stringify(context))}`;
}

describe("passkey sign-up registration options", () => {
  it("rejects anonymous requests without a sign-up context", async () => {
    const res = await SELF.fetch(OPTIONS_URL);
    expect(res.status).toBe(400);
  });

  it("issues WebAuthn options for a new email without creating a user yet", async () => {
    const res = await SELF.fetch(
      optionsUrl({ name: "Ada", email: "ada@example.com" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      challenge?: string;
      user?: { name?: string; displayName?: string };
    };
    expect(body.challenge).toBeTruthy();
    expect(body.user?.name).toBe("ada@example.com");
    expect(body.user?.displayName).toBe("Ada");

    // The account only comes into existence after the credential verifies.
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM user WHERE email = ?",
    )
      .bind("ada@example.com")
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it("rejects sign-up for an email that already has an account", async () => {
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind("pk-dupe", "Test", "dupe@example.com", 0, now, now)
      .run();

    const res = await SELF.fetch(
      optionsUrl({ name: "Dupe", email: "dupe@example.com" }),
    );
    expect(res.status).toBe(400);
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
