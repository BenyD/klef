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
    // A second workspace so "Agency" isn't the account's last one.
    await app.request("/workspaces", post({ name: "Keep" }), env);
    const projId = await id(
      await app.request("/projects", post({ workspaceId: wsId, name: "old" }), env),
    );
    await app.request("/files", post({ projectId: projId, name: ".env" }), env);

    expect((await app.request(`/projects/${projId}`, patch({ name: "renamed" }), env)).status).toBe(200);
    expect((await tree(app)).workspaces[0]!.projects[0]!.name).toBe("renamed");

    // Deleting the workspace cascades to projects + files.
    expect((await app.request(`/workspaces/${wsId}`, { method: "DELETE" }, env)).status).toBe(200);
    expect((await tree(app)).workspaces.map((w) => w.name)).toEqual(["Keep"]);
  });

  it("refuses to delete the account's only workspace", async () => {
    await seedUser("s7");
    const app = appForUser("s7");
    const wsId = await id(await app.request("/workspaces", post({ name: "Solo" }), env));

    const res = await app.request(`/workspaces/${wsId}`, { method: "DELETE" }, env);
    expect(res.status).toBe(409);
    expect((await tree(app)).workspaces[0]!.name).toBe("Solo");

    // With a second workspace, deleting the first is allowed again.
    await app.request("/workspaces", post({ name: "Second" }), env);
    expect((await app.request(`/workspaces/${wsId}`, { method: "DELETE" }, env)).status).toBe(200);
  });

  it("rejects invalid names and unknown parents", async () => {
    await seedUser("s3");
    const app = appForUser("s3");
    expect((await app.request("/workspaces", post({ name: "   " }), env)).status).toBe(400);
    expect(
      (await app.request("/projects", post({ workspaceId: "nope", name: "x" }), env)).status,
    ).toBe(404);
  });

  it("rejects workspace names that collide with routes or other workspaces", async () => {
    await seedUser("s9");
    const app = appForUser("s9");

    // Reserved: these double as klef.sh URLs.
    expect((await app.request("/workspaces", post({ name: "App" }), env)).status).toBe(400);
    expect((await app.request("/workspaces", post({ name: "security" }), env)).status).toBe(400);
    // Nothing routable left after slugifying.
    expect((await app.request("/workspaces", post({ name: "!!!" }), env)).status).toBe(400);

    const wsId = await id(await app.request("/workspaces", post({ name: "My Team" }), env));
    // Same slug through different casing/punctuation.
    expect((await app.request("/workspaces", post({ name: "my team!" }), env)).status).toBe(400);
    // Renaming to itself stays allowed (the check excludes the workspace).
    expect((await app.request(`/workspaces/${wsId}`, patch({ name: "My Team" }), env)).status).toBe(200);
    // Renaming onto another workspace's slug is not.
    await app.request("/workspaces", post({ name: "Other" }), env);
    expect((await app.request(`/workspaces/${wsId}`, patch({ name: "other" }), env)).status).toBe(400);
    // Reserved names are blocked on rename too.
    expect((await app.request(`/workspaces/${wsId}`, patch({ name: "Vault" }), env)).status).toBe(400);
  });

  it("stores, updates, and validates the project icon", async () => {
    await seedUser("s10");
    const app = appForUser("s10");
    const wsId = await id(await app.request("/workspaces", post({ name: "W" }), env));
    const projId = await id(
      await app.request(
        "/projects",
        post({ workspaceId: wsId, name: "P", icon: "https://dine.example/favicon.ico" }),
        env,
      ),
    );
    const icon = async () => (await tree(app)).workspaces[0]!.projects[0]!.icon;
    expect(await icon()).toBe("https://dine.example/favicon.ico");

    // Uploads arrive as small data URLs.
    expect(
      (await app.request(`/projects/${projId}`, patch({ icon: "data:image/png;base64,AAAA" }), env))
        .status,
    ).toBe(200);
    expect(await icon()).toBe("data:image/png;base64,AAAA");

    // Only https and data:image values are accepted.
    expect(
      (await app.request(`/projects/${projId}`, patch({ icon: "javascript:alert(1)" }), env))
        .status,
    ).toBe(400);

    // Explicit null clears it.
    expect((await app.request(`/projects/${projId}`, patch({ icon: null }), env)).status).toBe(200);
    expect(await icon()).toBeNull();
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

  it("creates files with an optional environment label", async () => {
    await seedUser("s4");
    const app = appForUser("s4");
    const wsId = await id(await app.request("/workspaces", post({ name: "W" }), env));
    const projId = await id(
      await app.request("/projects", post({ workspaceId: wsId, name: "P" }), env),
    );

    await app.request(
      "/files",
      post({ projectId: projId, name: ".env.production", environment: "production" }),
      env,
    );
    await app.request("/files", post({ projectId: projId, name: ".env.local" }), env);

    const files = (await tree(app)).workspaces[0]!.projects[0]!.files;
    expect(files.find((f) => f.name === ".env.production")!.environment).toBe("production");
    expect(files.find((f) => f.name === ".env.local")!.environment).toBeNull();
  });

  it("sets, changes, and clears a file's environment via PATCH", async () => {
    await seedUser("s5");
    const app = appForUser("s5");
    const wsId = await id(await app.request("/workspaces", post({ name: "W" }), env));
    const projId = await id(
      await app.request("/projects", post({ workspaceId: wsId, name: "P" }), env),
    );
    const fileId = await id(
      await app.request("/files", post({ projectId: projId, name: ".env" }), env),
    );

    const fileEnv = async () =>
      (await tree(app)).workspaces[0]!.projects[0]!.files[0]!.environment;

    expect(
      (await app.request(`/files/${fileId}`, patch({ environment: "development" }), env)).status,
    ).toBe(200);
    expect(await fileEnv()).toBe("development");

    // Rename and relabel in one PATCH.
    expect(
      (
        await app.request(
          `/files/${fileId}`,
          patch({ name: ".env.preview", environment: "preview" }),
          env,
        )
      ).status,
    ).toBe(200);
    expect(await fileEnv()).toBe("preview");
    expect((await tree(app)).workspaces[0]!.projects[0]!.files[0]!.name).toBe(".env.preview");

    // Clear with an explicit null.
    expect(
      (await app.request(`/files/${fileId}`, patch({ environment: null }), env)).status,
    ).toBe(200);
    expect(await fileEnv()).toBeNull();
  });

  it("creates and edits projects with an optional framework", async () => {
    await seedUser("s8");
    const app = appForUser("s8");
    const wsId = await id(await app.request("/workspaces", post({ name: "W" }), env));

    const projId = await id(
      await app.request(
        "/projects",
        post({ workspaceId: wsId, name: "app", framework: "nextjs" }),
        env,
      ),
    );
    const projFramework = async () =>
      (await tree(app)).workspaces[0]!.projects[0]!.framework;
    expect(await projFramework()).toBe("nextjs");

    // Change framework alone, then clear it alongside a rename.
    expect(
      (await app.request(`/projects/${projId}`, patch({ framework: "vite" }), env)).status,
    ).toBe(200);
    expect(await projFramework()).toBe("vite");
    expect(
      (
        await app.request(
          `/projects/${projId}`,
          patch({ name: "renamed", framework: null }),
          env,
        )
      ).status,
    ).toBe(200);
    expect(await projFramework()).toBeNull();
    expect((await tree(app)).workspaces[0]!.projects[0]!.name).toBe("renamed");

    // Unknown frameworks are rejected on create and update.
    expect(
      (
        await app.request(
          "/projects",
          post({ workspaceId: wsId, name: "x", framework: "angularjs" }),
          env,
        )
      ).status,
    ).toBe(400);
    expect(
      (await app.request(`/projects/${projId}`, patch({ framework: "x" }), env)).status,
    ).toBe(400);
    expect((await app.request(`/projects/${projId}`, patch({}), env)).status).toBe(400);
  });

  it("accepts custom environment labels and folds preset case-variants", async () => {
    await seedUser("s6c");
    const app = appForUser("s6c");
    const wsId = await id(await app.request("/workspaces", post({ name: "W" }), env));
    const projId = await id(
      await app.request("/projects", post({ workspaceId: wsId, name: "P" }), env),
    );

    await app.request(
      "/files",
      post({ projectId: projId, name: ".env.staging", environment: "staging" }),
      env,
    );
    const files = async () => (await tree(app)).workspaces[0]!.projects[0]!.files;
    expect((await files())[0]!.environment).toBe("staging");

    const fileId = (await files())[0]!.id;
    // Whitespace is trimmed and collapsed; presets fold onto lowercase.
    expect(
      (await app.request(`/files/${fileId}`, patch({ environment: "  QA  2 " }), env)).status,
    ).toBe(200);
    expect((await files())[0]!.environment).toBe("QA 2");
    expect(
      (await app.request(`/files/${fileId}`, patch({ environment: "Production" }), env)).status,
    ).toBe(200);
    expect((await files())[0]!.environment).toBe("production");
  });

  it("rejects invalid environment labels and empty updates", async () => {
    await seedUser("s6");
    const app = appForUser("s6");
    const wsId = await id(await app.request("/workspaces", post({ name: "W" }), env));
    const projId = await id(
      await app.request("/projects", post({ workspaceId: wsId, name: "P" }), env),
    );

    // Empty, over-long, bad characters, bad leading character, non-string.
    for (const environment of ["", "   ", "x".repeat(33), "qa!", "-qa", 5]) {
      expect(
        (
          await app.request(
            "/files",
            post({ projectId: projId, name: ".env", environment }),
            env,
          )
        ).status,
      ).toBe(400);
    }

    const fileId = await id(
      await app.request("/files", post({ projectId: projId, name: ".env" }), env),
    );
    expect(
      (await app.request(`/files/${fileId}`, patch({ environment: "st/aging" }), env)).status,
    ).toBe(400);
    expect((await app.request(`/files/${fileId}`, patch({}), env)).status).toBe(400);
  });

  it("sets, returns, clears, and validates a workspace icon", async () => {
    await seedUser("s11");
    const app = appForUser("s11");
    const wsId = await id(await app.request("/workspaces", post({ name: "Iconic" }), env));

    // New workspaces start without an icon.
    expect((await tree(app)).workspaces[0]!.icon).toBeNull();

    const dataUrl = "data:image/png;base64,aWNvbg==";
    expect(
      (await app.request(`/workspaces/${wsId}`, patch({ icon: dataUrl }), env)).status,
    ).toBe(200);
    expect((await tree(app)).workspaces[0]!.icon).toBe(dataUrl);

    // Icon-only patches must not touch the name; clearing works with null.
    expect((await tree(app)).workspaces[0]!.name).toBe("Iconic");
    expect(
      (await app.request(`/workspaces/${wsId}`, patch({ icon: null }), env)).status,
    ).toBe(200);
    expect((await tree(app)).workspaces[0]!.icon).toBeNull();

    // Junk schemes and empty patches are rejected.
    expect(
      (await app.request(`/workspaces/${wsId}`, patch({ icon: "javascript:alert(1)" }), env))
        .status,
    ).toBe(400);
    expect((await app.request(`/workspaces/${wsId}`, patch({}), env)).status).toBe(400);
  });

  it("accepts an icon at workspace creation and rejects junk ones", async () => {
    await seedUser("s12");
    const app = appForUser("s12");

    const iconUrl = "https://team.example/favicon.ico";
    await id(await app.request("/workspaces", post({ name: "Launched", icon: iconUrl }), env));
    expect((await tree(app)).workspaces[0]!.icon).toBe(iconUrl);

    // A bad icon fails the create outright rather than silently dropping it.
    expect(
      (await app.request("/workspaces", post({ name: "Bad", icon: "javascript:alert(1)" }), env))
        .status,
    ).toBe(400);
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
