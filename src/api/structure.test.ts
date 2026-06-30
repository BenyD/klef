import { SELF, env } from "cloudflare:test";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { structure } from "./structure.ts";
import type { AuthVariables } from "./middleware.ts";
import type { VaultTree } from "../shared/api-types.ts";

function appForUser(userId: string) {
  const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: userId, email: `${userId}@test.dev`, name: "Test" });
    c.set("sessionId", "stub");
    await next();
  });
  app.route("/", structure);
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

const post = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const patch = (body: unknown) => ({
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

async function tree(app: ReturnType<typeof appForUser>): Promise<VaultTree> {
  return (await app.request("/tree", {}, env)).json();
}
async function id(res: Response): Promise<string> {
  return ((await res.json()) as { id: string }).id;
}

describe("structure routes", () => {
  it("the real app requires a session", async () => {
    const res = await SELF.fetch("https://klef.test/api/tree");
    expect(res.status).toBe(401);
  });

  it("builds a nested tree across create operations", async () => {
    await seedUser("s1");
    const app = appForUser("s1");

    expect((await tree(app)).workspaces).toEqual([]);

    const wsId = await id(await app.request("/workspaces", post({ name: "Personal" }), env));
    const projId = await id(
      await app.request("/projects", post({ workspaceId: wsId, name: "klef" }), env),
    );
    await app.request("/files", post({ projectId: projId, name: ".env.local" }), env);

    const t = await tree(app);
    expect(t.workspaces).toHaveLength(1);
    expect(t.workspaces[0]!.name).toBe("Personal");
    expect(t.workspaces[0]!.projects[0]!.name).toBe("klef");
    expect(t.workspaces[0]!.projects[0]!.files[0]!.name).toBe(".env.local");
    expect(t.workspaces[0]!.projects[0]!.files[0]!.currentVersionId).toBeNull();
  });

  it("renames and cascade-deletes", async () => {
    await seedUser("s2");
    const app = appForUser("s2");
    const wsId = await id(await app.request("/workspaces", post({ name: "Agency" }), env));
    const projId = await id(
      await app.request("/projects", post({ workspaceId: wsId, name: "old" }), env),
    );
    await app.request("/files", post({ projectId: projId, name: ".env" }), env);

    expect((await app.request(`/projects/${projId}`, patch({ name: "renamed" }), env)).status).toBe(200);
    expect((await tree(app)).workspaces[0]!.projects[0]!.name).toBe("renamed");

    // Deleting the workspace cascades to projects + files.
    expect((await app.request(`/workspaces/${wsId}`, { method: "DELETE" }, env)).status).toBe(200);
    expect((await tree(app)).workspaces).toEqual([]);
  });

  it("rejects invalid names and unknown parents", async () => {
    await seedUser("s3");
    const app = appForUser("s3");
    expect((await app.request("/workspaces", post({ name: "   " }), env)).status).toBe(400);
    expect(
      (await app.request("/projects", post({ workspaceId: "nope", name: "x" }), env)).status,
    ).toBe(404);
  });

  it("isolates structure per user", async () => {
    await seedUser("owner");
    await seedUser("intruder");
    const owner = appForUser("owner");
    const intruder = appForUser("intruder");

    const wsId = await id(await owner.request("/workspaces", post({ name: "Secret" }), env));

    // Intruder can't see, rename, or delete the owner's workspace.
    expect((await tree(intruder)).workspaces).toEqual([]);
    expect((await intruder.request(`/workspaces/${wsId}`, patch({ name: "hacked" }), env)).status).toBe(404);
    expect((await intruder.request(`/workspaces/${wsId}`, { method: "DELETE" }, env)).status).toBe(404);

    // Owner still has it intact.
    expect((await tree(owner)).workspaces[0]!.name).toBe("Secret");
  });
});

const BLOB = { v: 1, alg: "AES-GCM", nonce: "bm9uY2Vub25j", ciphertext: "Y2lwaGVy" };

async function makeFile(app: ReturnType<typeof appForUser>): Promise<string> {
  const wsId = await id(await app.request("/workspaces", post({ name: "W" }), env));
  const pId = await id(await app.request("/projects", post({ workspaceId: wsId, name: "P" }), env));
  return id(await app.request("/files", post({ projectId: pId, name: ".env" }), env));
}

describe("env versions (save flow)", () => {
  it("starts with no current version, then saves and returns it", async () => {
    await seedUser("v1");
    const app = appForUser("v1");
    const fileId = await makeFile(app);

    expect(await (await app.request(`/files/${fileId}/current`, {}, env)).json()).toEqual({
      version: null,
    });

    const saved = await app.request(`/files/${fileId}/versions`, post({ blob: BLOB }), env);
    expect(saved.status).toBe(201);

    const current = (await (await app.request(`/files/${fileId}/current`, {}, env)).json()) as {
      version: { id: string; blob: typeof BLOB };
    };
    expect(current.version.blob).toEqual(BLOB);

    // The file's current_version_id now reflects the save in the tree.
    const t = await tree(app);
    expect(t.workspaces[0]!.projects[0]!.files[0]!.currentVersionId).toBe(current.version.id);
  });

  it("advances current_version_id on each save", async () => {
    await seedUser("v2");
    const app = appForUser("v2");
    const fileId = await makeFile(app);

    const first = await id(await app.request(`/files/${fileId}/versions`, post({ blob: BLOB }), env));
    const second = await id(
      await app.request(
        `/files/${fileId}/versions`,
        post({ blob: { ...BLOB, ciphertext: "Y2lwaGVyMg==" } }),
        env,
      ),
    );
    expect(second).not.toBe(first);

    const current = (await (await app.request(`/files/${fileId}/current`, {}, env)).json()) as {
      version: { id: string };
    };
    expect(current.version.id).toBe(second);
  });

  it("rejects an invalid blob (400) and another user's file (404)", async () => {
    await seedUser("v3");
    await seedUser("v3-intruder");
    const app = appForUser("v3");
    const fileId = await makeFile(app);

    expect(
      (await app.request(`/files/${fileId}/versions`, post({ blob: { junk: true } }), env)).status,
    ).toBe(400);

    const intruder = appForUser("v3-intruder");
    expect((await intruder.request(`/files/${fileId}/current`, {}, env)).status).toBe(404);
    expect(
      (await intruder.request(`/files/${fileId}/versions`, post({ blob: BLOB }), env)).status,
    ).toBe(404);
  });

  it("lists history newest-first and serves a single version; isolates by user", async () => {
    await seedUser("v4");
    await seedUser("v4-intruder");
    const app = appForUser("v4");
    const fileId = await makeFile(app);

    const firstId = await id(await app.request(`/files/${fileId}/versions`, post({ blob: BLOB }), env));
    const secondId = await id(
      await app.request(
        `/files/${fileId}/versions`,
        post({ blob: { ...BLOB, ciphertext: "Mg==" } }),
        env,
      ),
    );

    const history = (await (await app.request(`/files/${fileId}/versions`, {}, env)).json()) as {
      versions: { id: string; createdAt: string; isCurrent: boolean }[];
    };
    expect(history.versions.map((v) => v.id)).toEqual([secondId, firstId]); // newest first
    expect(history.versions.find((v) => v.id === secondId)!.isCurrent).toBe(true);
    expect(history.versions.find((v) => v.id === firstId)!.isCurrent).toBe(false);

    // Fetch a specific (older) version's blob.
    const one = (await (await app.request(`/files/${fileId}/versions/${firstId}`, {}, env)).json()) as {
      version: { blob: typeof BLOB };
    };
    expect(one.version.blob).toEqual(BLOB);

    // Another user can't read this file's versions.
    const intruder = appForUser("v4-intruder");
    expect((await intruder.request(`/files/${fileId}/versions`, {}, env)).status).toBe(404);
    expect((await intruder.request(`/files/${fileId}/versions/${firstId}`, {}, env)).status).toBe(404);
  });
});
