import { Hono } from "hono";
import type { AuthVariables } from "./middleware.ts";
import type { VaultKeyMaterial, WrappedKey } from "../shared/types.ts";

// These routes assume a session is already established and `user` is set — the
// auth gate is applied where they're mounted (see index.ts). The stored
// material is opaque ciphertext, so returning it to the authenticated owner is
// safe: it can't be decrypted without the passphrase or recovery key, neither
// of which the server ever sees.
export const vault = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

function isWrappedKey(v: unknown): v is WrappedKey {
  if (typeof v !== "object" || v === null) return false;
  const w = v as Record<string, unknown>;
  return (
    typeof w.v === "number" &&
    w.alg === "AES-GCM" &&
    typeof w.nonce === "string" &&
    typeof w.ciphertext === "string"
  );
}

function isKdfParams(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return typeof p.id === "string" && typeof p.salt === "string";
}

function isKeyMaterial(v: unknown): v is VaultKeyMaterial {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    isKdfParams(m.kdfParams) &&
    isWrappedKey(m.wrappedDek) &&
    isWrappedKey(m.wrappedDekRecovery)
  );
}

interface VaultRow {
  kdf_params: string;
  wrapped_dek: string;
  wrapped_dek_recovery: string;
}

// Does the current user have a vault yet, and if so return its key material.
vault.get("/", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT kdf_params, wrapped_dek, wrapped_dek_recovery FROM vault WHERE user_id = ?",
  )
    .bind(c.get("user").id)
    .first<VaultRow>();

  if (!row) return c.json({ exists: false });

  return c.json({
    exists: true,
    keyMaterial: {
      kdfParams: JSON.parse(row.kdf_params),
      wrappedDek: JSON.parse(row.wrapped_dek),
      wrappedDekRecovery: JSON.parse(row.wrapped_dek_recovery),
    } satisfies VaultKeyMaterial,
  });
});

// First-run setup. One vault per user — re-posting is a conflict.
vault.post("/", async (c) => {
  const body = (await c.req.json().catch(() => null)) as unknown;
  if (!isKeyMaterial(body)) {
    return c.json({ ok: false, error: "Invalid key material" }, 400);
  }

  const userId = c.get("user").id;
  const exists = await c.env.DB.prepare("SELECT 1 FROM vault WHERE user_id = ?")
    .bind(userId)
    .first();
  if (exists) return c.json({ ok: false, error: "Vault already exists" }, 409);

  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO vault (user_id, kdf_params, wrapped_dek, wrapped_dek_recovery, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      userId,
      JSON.stringify(body.kdfParams),
      JSON.stringify(body.wrappedDek),
      JSON.stringify(body.wrappedDekRecovery),
      now,
      now,
    )
    .run();

  return c.json({ ok: true }, 201);
});

// Passphrase change: re-wrap only (new KDF params + new wrapped DEK). The
// recovery-wrapped DEK is untouched, and no blobs are re-encrypted.
vault.put("/passphrase", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    kdfParams?: unknown;
    wrappedDek?: unknown;
  } | null;

  if (!body || !isKdfParams(body.kdfParams) || !isWrappedKey(body.wrappedDek)) {
    return c.json({ ok: false, error: "Invalid payload" }, 400);
  }

  const res = await c.env.DB.prepare(
    "UPDATE vault SET kdf_params = ?, wrapped_dek = ?, updated_at = ? WHERE user_id = ?",
  )
    .bind(
      JSON.stringify(body.kdfParams),
      JSON.stringify(body.wrappedDek),
      new Date().toISOString(),
      c.get("user").id,
    )
    .run();

  if (res.meta.changes === 0) {
    return c.json({ ok: false, error: "No vault to update" }, 404);
  }
  return c.json({ ok: true });
});
