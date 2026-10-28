import { Hono } from "hono";
import type { AuthVariables } from "./middleware.ts";
import { generateToken, hashToken, tokenDisplayPrefix } from "./access-token.ts";
import {
  DEVICE_CODE_TTL_MS,
  DEVICE_POLL_INTERVAL_MS,
  generateDeviceCode,
  generateUserCode,
  isDeviceCodeShape,
  normalizeUserCode,
} from "../shared/device-code.ts";
import { isPublicJwk, sealToken } from "../shared/device-seal.ts";
import { isSealedVaultKey } from "../shared/device-unlock.ts";
import { bytesToBase64, utf8ToBytes } from "../shared/encoding.ts";
import { tidyMachineLabel } from "../cli/machine-label.ts";

// Browser sign-in for the CLI.
//
// `start` and `poll` are deliberately open: the CLI has no credentials yet,
// which is the entire point of the flow. Everything that grants something -
// reading whose request a code is, approving it, denying it - is gated on a
// real browser session where these are mounted (index.ts), and never on an
// access token: a token that could approve new logins would let a leaked one
// mint successors and outlive its own revocation.
export const device = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/** Client-supplied and rendered on the approval page, so cap and strip it. */
const MAX_LABEL = 60;

/** What a login that named no machine is called on the approval page. */
const UNNAMED = "a terminal";

function cleanLabel(input: unknown): string {
  if (typeof input !== "string") return UNNAMED;
  const label = tidyMachineLabel(input.replace(/[^\w .\-()]/g, ""))
    .slice(0, MAX_LABEL)
    .trim();
  return label === "" ? UNNAMED : label;
}

/**
 * The token a login mints is named after the machine that asked for it, so
 * the token list reads "macOS on Benys-MacBook-Pro" rather than the one-time
 * code, which means nothing once the login is done.
 */
export function tokenNameForLogin(label: string): string {
  return label === UNNAMED ? "CLI login" : label;
}

/** Only the hash is stored, the same rule access tokens follow. */
async function deviceHash(code: string): Promise<string> {
  return bytesToBase64(
    new Uint8Array(await crypto.subtle.digest("SHA-256", utf8ToBytes(code))),
  );
}

interface DeviceRow {
  id: string;
  public_jwk: string;
  user_id: string | null;
  approved_at: string | null;
  denied_at: string | null;
  token_sealed: string | null;
  vault_key_sealed: string | null;
  collected_at: string | null;
  expires_at: string;
}

const expired = (at: string): boolean => Date.parse(at) <= Date.now();

/** Begin a login. Returns both codes; only the device code's hash is kept. */
device.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    label?: unknown;
    publicJwk?: unknown;
  };

  // Without a key to seal to there is nowhere safe to park the token, so this
  // is required rather than optional.
  if (!isPublicJwk(body.publicJwk)) {
    return c.json({ ok: false, error: "A P-256 public key is required" }, 400);
  }

  const deviceCode = generateDeviceCode();
  const now = new Date();

  // Sealed material never outlives its request: a login nobody collected
  // keeps neither its sealed token nor its sealed vault key past expiry.
  await c.env.DB.prepare(
    `UPDATE device_authorizations SET token_sealed = NULL, vault_key_sealed = NULL
     WHERE expires_at <= ? AND (token_sealed IS NOT NULL OR vault_key_sealed IS NOT NULL)`,
  )
    .bind(now.toISOString())
    .run();

  // A duplicate user code would attach someone's approval to the wrong
  // request, so retry rather than trusting 40 bits to never collide.
  let userCode = generateUserCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const taken = await c.env.DB.prepare(
      "SELECT 1 FROM device_authorizations WHERE user_code = ? AND expires_at > ?",
    )
      .bind(userCode, now.toISOString())
      .first();
    if (!taken) break;
    userCode = generateUserCode();
  }

  await c.env.DB.prepare(
    `INSERT INTO device_authorizations
       (id, device_hash, user_code, label, public_jwk, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      await deviceHash(deviceCode),
      userCode,
      cleanLabel(body.label),
      JSON.stringify(body.publicJwk),
      new Date(now.getTime() + DEVICE_CODE_TTL_MS).toISOString(),
      now.toISOString(),
    )
    .run();

  return c.json({
    deviceCode,
    userCode,
    verificationUri: `${new URL(c.req.url).origin}/cli`,
    expiresIn: Math.floor(DEVICE_CODE_TTL_MS / 1000),
    interval: Math.floor(DEVICE_POLL_INTERVAL_MS / 1000),
  });
});

/**
 * Collect the sealed token once approved. Single use: the seal is cleared on
 * the first successful poll, so a replayed device code gets nothing.
 */
device.post("/token", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { deviceCode?: unknown };
  if (typeof body.deviceCode !== "string" || !isDeviceCodeShape(body.deviceCode)) {
    return c.json({ status: "invalid" }, 400);
  }

  const row = await c.env.DB.prepare(
    `SELECT id, public_jwk, user_id, approved_at, denied_at, token_sealed, vault_key_sealed, collected_at, expires_at
     FROM device_authorizations WHERE device_hash = ?`,
  )
    .bind(await deviceHash(body.deviceCode))
    .first<DeviceRow>();

  // Unknown and expired give the same answer on purpose: polling should tell
  // an attacker nothing about which codes exist.
  if (row && expired(row.expires_at) && (row.token_sealed || row.vault_key_sealed)) {
    await c.env.DB.prepare(
      "UPDATE device_authorizations SET token_sealed = NULL, vault_key_sealed = NULL WHERE id = ?",
    )
      .bind(row.id)
      .run();
  }
  if (!row || expired(row.expires_at)) return c.json({ status: "expired" }, 410);
  if (row.denied_at) return c.json({ status: "denied" }, 403);
  if (!row.approved_at || !row.token_sealed || row.collected_at) {
    return c.json({ status: "pending" }, 428);
  }

  await c.env.DB.prepare(
    "UPDATE device_authorizations SET collected_at = ?, token_sealed = NULL, vault_key_sealed = NULL WHERE id = ?",
  )
    .bind(new Date().toISOString(), row.id)
    .run();

  return c.json({
    status: "ready",
    sealedToken: JSON.parse(row.token_sealed),
    // Present when the browser also unlocked this CLI; opaque to the server.
    sealedVaultKey: row.vault_key_sealed ? JSON.parse(row.vault_key_sealed) : null,
  });
});

/** What the approval page shows before anyone clicks. Session-gated. */
device.get("/pending/:userCode", async (c) => {
  const userCode = normalizeUserCode(c.req.param("userCode"));
  if (!userCode) return c.json({ ok: false, error: "That code isn't valid." }, 404);

  const row = await c.env.DB.prepare(
    `SELECT label, public_jwk, expires_at, approved_at, denied_at
     FROM device_authorizations WHERE user_code = ?`,
  )
    .bind(userCode)
    .first<{
      label: string;
      public_jwk: string;
      expires_at: string;
      approved_at: string | null;
      denied_at: string | null;
    }>();

  if (!row || expired(row.expires_at)) {
    return c.json(
      { ok: false, error: "That code has expired. Start again in your terminal." },
      404,
    );
  }
  if (row.approved_at || row.denied_at) {
    return c.json({ ok: false, error: "That code has already been used." }, 409);
  }

  // The CLI's public key, so the page can seal the vault key to it if the
  // user chooses to unlock this CLI too. Public by definition.
  return c.json({
    ok: true,
    userCode,
    label: row.label,
    expiresAt: row.expires_at,
    publicJwk: JSON.parse(row.public_jwk) as unknown,
  });
});

/** Approve or deny. Session-gated, so a token can never authorise a new one. */
device.post("/approve", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    userCode?: unknown;
    deny?: unknown;
    sealedVaultKey?: unknown;
  };
  const userCode =
    typeof body.userCode === "string" ? normalizeUserCode(body.userCode) : null;
  if (!userCode) return c.json({ ok: false, error: "That code isn't valid." }, 400);

  const row = await c.env.DB.prepare(
    `SELECT id, label, public_jwk, expires_at, approved_at, denied_at
     FROM device_authorizations WHERE user_code = ?`,
  )
    .bind(userCode)
    .first<
      Pick<DeviceRow, "id" | "public_jwk" | "expires_at" | "approved_at" | "denied_at"> & {
        label: string;
      }
    >();

  if (!row || expired(row.expires_at)) {
    return c.json(
      { ok: false, error: "That code has expired. Start again in your terminal." },
      404,
    );
  }
  if (row.approved_at || row.denied_at) {
    return c.json({ ok: false, error: "That code has already been used." }, 409);
  }

  const now = new Date().toISOString();

  if (body.deny === true) {
    await c.env.DB.prepare(
      "UPDATE device_authorizations SET denied_at = ? WHERE id = ?",
    )
      .bind(now, row.id)
      .run();
    return c.json({ ok: true, denied: true });
  }

  const publicJwk: unknown = JSON.parse(row.public_jwk);
  if (!isPublicJwk(publicJwk)) {
    return c.json({ ok: false, error: "That request is malformed. Start again." }, 400);
  }
  // Optional: the vault key the browser sealed to this CLI. Shape-checked and
  // stored as given; the server cannot open it and does not try.
  if (body.sealedVaultKey !== undefined && body.sealedVaultKey !== null && !isSealedVaultKey(body.sealedVaultKey)) {
    return c.json({ ok: false, error: "That unlock key is malformed." }, 400);
  }
  const vaultKeySealed = body.sealedVaultKey ? JSON.stringify(body.sealedVaultKey) : null;

  // Minting and marking approved go together: a token that existed without its
  // request being closed out could be handed to a second poller.
  const token = generateToken();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO access_tokens (id, user_id, name, token_hash, prefix, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      c.get("user").id,
      tokenNameForLogin(row.label),
      await hashToken(token),
      tokenDisplayPrefix(token),
      now,
    ),
    c.env.DB.prepare(
      `UPDATE device_authorizations
       SET user_id = ?, approved_at = ?, token_sealed = ?, vault_key_sealed = ? WHERE id = ?`,
    ).bind(
      c.get("user").id,
      now,
      JSON.stringify(await sealToken(publicJwk, token)),
      vaultKeySealed,
      row.id,
    ),
  ]);

  return c.json({ ok: true });
});
