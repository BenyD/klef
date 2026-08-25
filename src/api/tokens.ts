import { Hono } from "hono";
import type { AuthVariables } from "./middleware.ts";
import type { AccessTokenSummary } from "../shared/api-types.ts";
import { generateToken, hashToken, tokenDisplayPrefix } from "./access-token.ts";

// Personal access token management. Auth is applied where these are mounted
// (index.ts), which also narrows them to browser sessions — a token can never
// mint or revoke tokens. See `requireSession`.
export const tokens = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const MAX_NAME = 100;

/** A guard against unbounded growth, not a meaningful product limit. */
export const MAX_TOKENS_PER_USER = 50;

/** Ten years is "never" in practice, and keeps the input a single number. */
const MAX_EXPIRY_DAYS = 3650;

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

function toSummary(row: TokenRow): AccessTokenSummary {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function cleanName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.trim();
  if (name.length === 0 || name.length > MAX_NAME) return null;
  return name;
}

/** undefined = absent (never expires); null = invalid. */
function expiryFromDays(input: unknown, now: Date): string | null | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== "number" || !Number.isInteger(input)) return null;
  if (input < 1 || input > MAX_EXPIRY_DAYS) return null;
  return new Date(now.getTime() + input * 24 * 60 * 60 * 1000).toISOString();
}

// Newest first — the list is short and read by humans.
tokens.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, name, prefix, last_used_at, expires_at, created_at
     FROM access_tokens WHERE user_id = ? ORDER BY created_at DESC`,
  )
    .bind(c.get("user").id)
    .all<TokenRow>();

  return c.json({ tokens: rows.results.map(toSummary) });
});

// Mint a token. The plaintext token is in this response and nowhere else, ever
// again — the database only holds its hash.
tokens.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: unknown;
    expiresInDays?: unknown;
  };

  const name = cleanName(body.name);
  if (!name) return c.json({ ok: false, error: "Invalid name" }, 400);

  const now = new Date();
  const expiresAt = expiryFromDays(body.expiresInDays, now);
  if (expiresAt === null) {
    return c.json({ ok: false, error: "Invalid expiry" }, 400);
  }

  const userId = c.get("user").id;
  const count = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM access_tokens WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ n: number }>();

  if ((count?.n ?? 0) >= MAX_TOKENS_PER_USER) {
    return c.json(
      { ok: false, error: `You can have at most ${MAX_TOKENS_PER_USER} tokens` },
      409,
    );
  }

  const token = generateToken();
  const row: TokenRow = {
    id: crypto.randomUUID(),
    name,
    prefix: tokenDisplayPrefix(token),
    last_used_at: null,
    expires_at: expiresAt ?? null,
    created_at: now.toISOString(),
  };

  await c.env.DB.prepare(
    `INSERT INTO access_tokens (id, user_id, name, token_hash, prefix, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      row.id,
      userId,
      row.name,
      await hashToken(token),
      row.prefix,
      row.expires_at,
      row.created_at,
    )
    .run();

  return c.json({ ok: true, token, accessToken: toSummary(row) }, 201);
});

// Revocation is immediate: the next request carrying this token fails to
// resolve a row and 401s.
tokens.delete("/:id", async (c) => {
  const result = await c.env.DB.prepare(
    "DELETE FROM access_tokens WHERE id = ? AND user_id = ?",
  )
    .bind(c.req.param("id"), c.get("user").id)
    .run();

  if (!result.meta.changes) {
    return c.json({ ok: false, error: "Not found" }, 404);
  }
  return c.json({ ok: true });
});
