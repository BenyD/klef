import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// Account deletion relies on every table cascading from user(id): Better
// Auth's delete-user endpoint issues one DELETE on the user row, and the
// database is responsible for taking sessions, accounts, passkeys, the vault,
// and the whole workspace tree down with it. This proves the cascades hold.
describe("account deletion cascades", () => {
  it("deleting the user row wipes every dependent table", async () => {
    const uid = "wipe-me";
    const now = new Date().toISOString();
    const batch = [
      env.DB.prepare(
        "INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)",
      ).bind(uid, "Wipe", "wipe@test.dev", now, now),
      env.DB.prepare(
        "INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES ('wipe-s', ?, 'wipe-token', ?, ?, ?)",
      ).bind(now, now, now, uid),
      env.DB.prepare(
        "INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES ('wipe-a', 'wipe-a', 'google', ?, ?, ?)",
      ).bind(uid, now, now),
      env.DB.prepare(
        "INSERT INTO passkey (id, publicKey, userId, credentialID, counter, deviceType, backedUp) VALUES ('wipe-p', 'pk', ?, 'cred', 0, 'multiDevice', 1)",
      ).bind(uid),
      env.DB.prepare(
        "INSERT INTO vault (user_id, kdf_params, wrapped_dek, wrapped_dek_recovery) VALUES (?, '{}', '{}', '{}')",
      ).bind(uid),
      env.DB.prepare(
        "INSERT INTO workspaces (id, user_id, name) VALUES ('wipe-ws', ?, 'W')",
      ).bind(uid),
      env.DB.prepare(
        "INSERT INTO projects (id, workspace_id, name) VALUES ('wipe-proj', 'wipe-ws', 'P')",
      ),
      env.DB.prepare(
        "INSERT INTO env_files (id, project_id, name) VALUES ('wipe-file', 'wipe-proj', '.env')",
      ),
      env.DB.prepare(
        "INSERT INTO env_versions (id, env_file_id, blob) VALUES ('wipe-v', 'wipe-file', '{}')",
      ),
    ];
    for (const stmt of batch) await stmt.run();

    await env.DB.prepare("DELETE FROM user WHERE id = ?").bind(uid).run();

    const counts = await env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM session WHERE userId = ?1) +
        (SELECT COUNT(*) FROM account WHERE userId = ?1) +
        (SELECT COUNT(*) FROM passkey WHERE userId = ?1) +
        (SELECT COUNT(*) FROM vault WHERE user_id = ?1) +
        (SELECT COUNT(*) FROM workspaces WHERE user_id = ?1) +
        (SELECT COUNT(*) FROM projects WHERE id = 'wipe-proj') +
        (SELECT COUNT(*) FROM env_files WHERE id = 'wipe-file') +
        (SELECT COUNT(*) FROM env_versions WHERE id = 'wipe-v') AS leftovers`,
    )
      .bind(uid)
      .first<{ leftovers: number }>();
    expect(counts?.leftovers).toBe(0);
  });
});
