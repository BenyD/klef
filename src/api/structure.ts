import { Hono } from "hono";
import type { AuthVariables } from "./middleware.ts";
import {
  FRAMEWORKS,
  normalizeEnvironment,
  type Environment,
  type EnvFileNode,
  type Framework,
  type ProjectNode,
  type VaultTree,
  type WorkspaceNode,
} from "../shared/api-types.ts";
import { RESERVED_SLUGS, slugify } from "../shared/slug.ts";

// Workspaces / projects / env files (plaintext names). Auth is applied where
// these are mounted (index.ts), so the module stays unit-testable with a stub
// session. Every query is scoped to the owning user.
export const structure = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const MAX_NAME = 200;

function pushInto<T>(map: Map<string, T[]>, key: string, value: T): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

function cleanName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.trim();
  if (name.length === 0 || name.length > MAX_NAME) return null;
  return name;
}

/** null = no label; a valid label normalizes through; anything else is invalid. */
function cleanEnvironment(input: unknown): Environment | null | undefined {
  if (input === null) return null;
  if (typeof input !== "string") return undefined;
  return normalizeEnvironment(input) ?? undefined;
}

/** Same contract as cleanEnvironment, for the project framework field. */
function cleanFramework(input: unknown): Framework | null | undefined {
  if (input === null) return null;
  if (
    typeof input === "string" &&
    (FRAMEWORKS as readonly string[]).includes(input)
  ) {
    return input as Framework;
  }
  return undefined;
}

// Room for a 64px PNG as a data URL with margin; also caps pasted URLs.
const MAX_ICON_LENGTH = 150_000;

/** Same contract as cleanEnvironment, for the project icon field. */
function cleanIcon(input: unknown): string | null | undefined {
  if (input === null) return null;
  if (typeof input !== "string") return undefined;
  const icon = input.trim();
  if (!icon) return null;
  if (icon.length > MAX_ICON_LENGTH) return undefined;
  if (icon.startsWith("https://") || icon.startsWith("data:image/")) {
    return icon;
  }
  return undefined;
}

// Workspace names double as root URLs (klef.sh/<slug>), so beyond cleanName
// they must slugify to something routable, unreserved, and unique per user
// (two names that collapse to the same slug would be unreachable).
async function workspaceNameError(
  db: D1Database,
  userId: string,
  name: string,
  excludeId?: string,
): Promise<string | null> {
  const slug = slugify(name);
  if (!slug) return "Use at least one letter or number";
  if (RESERVED_SLUGS.has(slug)) return "That name is reserved";

  const rows = await db
    .prepare("SELECT id, name FROM workspaces WHERE user_id = ?")
    .bind(userId)
    .all<{ id: string; name: string }>();
  const taken = rows.results.some(
    (w) => w.id !== excludeId && slugify(w.name) === slug,
  );
  return taken ? "A workspace with a similar name already exists" : null;
}

async function ownsWorkspace(db: D1Database, userId: string, id: string) {
  return !!(await db
    .prepare("SELECT 1 FROM workspaces WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first());
}

async function ownsProject(db: D1Database, userId: string, id: string) {
  return !!(await db
    .prepare(
      `SELECT 1 FROM projects p
       JOIN workspaces w ON p.workspace_id = w.id
       WHERE p.id = ? AND w.user_id = ?`,
    )
    .bind(id, userId)
    .first());
}

/** Returns the file (with its current version pointer) iff owned by the user. */
function fileForUser(db: D1Database, userId: string, id: string) {
  return db
    .prepare(
      `SELECT f.id, f.current_version_id
       FROM env_files f
       JOIN projects p ON f.project_id = p.id
       JOIN workspaces w ON p.workspace_id = w.id
       WHERE f.id = ? AND w.user_id = ?`,
    )
    .bind(id, userId)
    .first<{ id: string; current_version_id: string | null }>();
}

function isBlob(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const b = v as Record<string, unknown>;
  return (
    typeof b.v === "number" &&
    b.alg === "AES-GCM" &&
    typeof b.nonce === "string" &&
    typeof b.ciphertext === "string"
  );
}

// --- read: the whole tree --------------------------------------------------

structure.get("/tree", async (c) => {
  const userId = c.get("user").id;

  const [ws, projects, files] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id, name, icon, created_at FROM workspaces WHERE user_id = ? ORDER BY created_at, name",
    )
      .bind(userId)
      .all<{ id: string; name: string; icon: string | null; created_at: string }>(),
    c.env.DB.prepare(
      `SELECT p.id, p.workspace_id, p.name, p.framework, p.icon, p.created_at
       FROM projects p JOIN workspaces w ON p.workspace_id = w.id
       WHERE w.user_id = ? ORDER BY p.created_at, p.name`,
    )
      .bind(userId)
      .all<{
        id: string;
        workspace_id: string;
        name: string;
        framework: Framework | null;
        icon: string | null;
        created_at: string;
      }>(),
    c.env.DB.prepare(
      `SELECT f.id, f.project_id, f.name, f.current_version_id, f.environment, f.created_at
       FROM env_files f
       JOIN projects p ON f.project_id = p.id
       JOIN workspaces w ON p.workspace_id = w.id
       WHERE w.user_id = ? ORDER BY f.created_at, f.name`,
    )
      .bind(userId)
      .all<{
        id: string;
        project_id: string;
        name: string;
        current_version_id: string | null;
        environment: Environment | null;
        created_at: string;
      }>(),
  ]);

  const fileNodes = new Map<string, EnvFileNode[]>();
  for (const f of files.results) {
    pushInto(fileNodes, f.project_id, {
      id: f.id,
      name: f.name,
      currentVersionId: f.current_version_id,
      environment: f.environment,
      createdAt: f.created_at,
    });
  }

  const projectNodes = new Map<string, ProjectNode[]>();
  for (const p of projects.results) {
    pushInto(projectNodes, p.workspace_id, {
      id: p.id,
      name: p.name,
      framework: p.framework,
      icon: p.icon,
      createdAt: p.created_at,
      files: fileNodes.get(p.id) ?? [],
    });
  }

  const workspaces: WorkspaceNode[] = ws.results.map((w) => ({
    id: w.id,
    name: w.name,
    icon: w.icon,
    createdAt: w.created_at,
    projects: projectNodes.get(w.id) ?? [],
  }));

  return c.json({ workspaces } satisfies VaultTree);
});

// --- workspaces ------------------------------------------------------------

structure.post("/workspaces", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
  const name = cleanName(body.name);
  if (!name) return c.json({ ok: false, error: "Invalid name" }, 400);
  const slugError = await workspaceNameError(c.env.DB, c.get("user").id, name);
  if (slugError) return c.json({ ok: false, error: slugError }, 400);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO workspaces (id, user_id, name) VALUES (?, ?, ?)",
  )
    .bind(id, c.get("user").id, name)
    .run();
  return c.json({ id, name }, 201);
});

structure.patch("/workspaces/:id", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: unknown;
    icon?: unknown;
  };
  const sets: string[] = [];
  const binds: (string | null)[] = [];

  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) return c.json({ ok: false, error: "Invalid name" }, 400);
    const slugError = await workspaceNameError(
      c.env.DB,
      c.get("user").id,
      name,
      c.req.param("id"),
    );
    if (slugError) return c.json({ ok: false, error: slugError }, 400);
    sets.push("name = ?");
    binds.push(name);
  }

  if (body.icon !== undefined) {
    const icon = cleanIcon(body.icon);
    if (icon === undefined) {
      return c.json({ ok: false, error: "Invalid icon" }, 400);
    }
    sets.push("icon = ?");
    binds.push(icon);
  }

  if (sets.length === 0) {
    return c.json({ ok: false, error: "Nothing to update" }, 400);
  }

  const res = await c.env.DB.prepare(
    `UPDATE workspaces SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
  )
    .bind(...binds, c.req.param("id"), c.get("user").id)
    .run();
  if (res.meta.changes === 0) return c.json({ ok: false, error: "Not found" }, 404);
  return c.json({ ok: true });
});

structure.delete("/workspaces/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  if (!(await ownsWorkspace(c.env.DB, userId, id))) {
    return c.json({ ok: false, error: "Not found" }, 404);
  }

  // Every account keeps at least one workspace; the last one can only be
  // renamed, never deleted (mirrored in the UI's account settings).
  const row = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM workspaces WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ n: number }>();
  if ((row?.n ?? 0) <= 1) {
    return c.json(
      { ok: false, error: "You can't delete your only workspace" },
      409,
    );
  }

  await c.env.DB.prepare("DELETE FROM workspaces WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .run();
  return c.json({ ok: true });
});

// --- projects --------------------------------------------------------------

structure.post("/projects", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    workspaceId?: unknown;
    name?: unknown;
    framework?: unknown;
    icon?: unknown;
  };
  const name = cleanName(body.name);
  if (!name || typeof body.workspaceId !== "string") {
    return c.json({ ok: false, error: "Invalid payload" }, 400);
  }
  const framework = cleanFramework(body.framework ?? null);
  if (framework === undefined) {
    return c.json({ ok: false, error: "Invalid framework" }, 400);
  }
  const icon = cleanIcon(body.icon ?? null);
  if (icon === undefined) {
    return c.json({ ok: false, error: "Invalid icon" }, 400);
  }
  if (!(await ownsWorkspace(c.env.DB, c.get("user").id, body.workspaceId))) {
    return c.json({ ok: false, error: "Not found" }, 404);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO projects (id, workspace_id, name, framework, icon) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, body.workspaceId, name, framework, icon)
    .run();
  return c.json({ id, name }, 201);
});

structure.patch("/projects/:id", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: unknown;
    framework?: unknown;
    icon?: unknown;
  };

  // Accept name and/or framework; at least one must be present and valid.
  const sets: string[] = [];
  const binds: (string | null)[] = [];
  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) return c.json({ ok: false, error: "Invalid name" }, 400);
    sets.push("name = ?");
    binds.push(name);
  }
  if ("framework" in body) {
    const framework = cleanFramework(body.framework);
    if (framework === undefined) {
      return c.json({ ok: false, error: "Invalid framework" }, 400);
    }
    sets.push("framework = ?");
    binds.push(framework);
  }
  if ("icon" in body) {
    const icon = cleanIcon(body.icon);
    if (icon === undefined) {
      return c.json({ ok: false, error: "Invalid icon" }, 400);
    }
    sets.push("icon = ?");
    binds.push(icon);
  }
  if (sets.length === 0) return c.json({ ok: false, error: "Empty update" }, 400);

  if (!(await ownsProject(c.env.DB, c.get("user").id, c.req.param("id")))) {
    return c.json({ ok: false, error: "Not found" }, 404);
  }
  await c.env.DB.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds, c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

structure.delete("/projects/:id", async (c) => {
  if (!(await ownsProject(c.env.DB, c.get("user").id, c.req.param("id")))) {
    return c.json({ ok: false, error: "Not found" }, 404);
  }
  await c.env.DB.prepare("DELETE FROM projects WHERE id = ?")
    .bind(c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

// --- env files -------------------------------------------------------------

structure.post("/files", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    projectId?: unknown;
    name?: unknown;
    environment?: unknown;
  };
  const name = cleanName(body.name);
  if (!name || typeof body.projectId !== "string") {
    return c.json({ ok: false, error: "Invalid payload" }, 400);
  }
  const environment = cleanEnvironment(body.environment ?? null);
  if (environment === undefined) {
    return c.json({ ok: false, error: "Invalid environment" }, 400);
  }
  if (!(await ownsProject(c.env.DB, c.get("user").id, body.projectId))) {
    return c.json({ ok: false, error: "Not found" }, 404);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO env_files (id, project_id, name, environment) VALUES (?, ?, ?, ?)",
  )
    .bind(id, body.projectId, name, environment)
    .run();
  return c.json({ id, name }, 201);
});

structure.patch("/files/:id", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: unknown;
    environment?: unknown;
  };

  // Accept name and/or environment; at least one must be present and valid.
  const sets: string[] = [];
  const binds: (string | null)[] = [];
  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) return c.json({ ok: false, error: "Invalid name" }, 400);
    sets.push("name = ?");
    binds.push(name);
  }
  if ("environment" in body) {
    const environment = cleanEnvironment(body.environment);
    if (environment === undefined) {
      return c.json({ ok: false, error: "Invalid environment" }, 400);
    }
    sets.push("environment = ?");
    binds.push(environment);
  }
  if (sets.length === 0) return c.json({ ok: false, error: "Empty update" }, 400);

  // Ownership via the file's project chain.
  const owned = await c.env.DB.prepare(
    `SELECT 1 FROM env_files f
     JOIN projects p ON f.project_id = p.id
     JOIN workspaces w ON p.workspace_id = w.id
     WHERE f.id = ? AND w.user_id = ?`,
  )
    .bind(c.req.param("id"), c.get("user").id)
    .first();
  if (!owned) return c.json({ ok: false, error: "Not found" }, 404);

  await c.env.DB.prepare(`UPDATE env_files SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds, c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

structure.delete("/files/:id", async (c) => {
  const owned = await c.env.DB.prepare(
    `SELECT 1 FROM env_files f
     JOIN projects p ON f.project_id = p.id
     JOIN workspaces w ON p.workspace_id = w.id
     WHERE f.id = ? AND w.user_id = ?`,
  )
    .bind(c.req.param("id"), c.get("user").id)
    .first();
  if (!owned) return c.json({ ok: false, error: "Not found" }, 404);

  await c.env.DB.prepare("DELETE FROM env_files WHERE id = ?")
    .bind(c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

// --- env versions (Phase 5: the save flow) ---------------------------------

// The current (latest) version's opaque blob, for in-browser decrypt + diff.
structure.get("/files/:id/current", async (c) => {
  const file = await fileForUser(c.env.DB, c.get("user").id, c.req.param("id"));
  if (!file) return c.json({ ok: false, error: "Not found" }, 404);
  if (!file.current_version_id) return c.json({ version: null });

  const row = await c.env.DB.prepare(
    "SELECT id, blob, created_at FROM env_versions WHERE id = ?",
  )
    .bind(file.current_version_id)
    .first<{ id: string; blob: string; created_at: string }>();
  if (!row) return c.json({ version: null });

  return c.json({
    version: { id: row.id, blob: JSON.parse(row.blob), createdAt: row.created_at },
  });
});

// Version history (newest first), with a flag for the current one.
structure.get("/files/:id/versions", async (c) => {
  const file = await fileForUser(c.env.DB, c.get("user").id, c.req.param("id"));
  if (!file) return c.json({ ok: false, error: "Not found" }, 404);

  const rows = await c.env.DB.prepare(
    // rowid tiebreak keeps ordering deterministic when two saves land in the
    // same millisecond (created_at would otherwise tie).
    "SELECT id, created_at FROM env_versions WHERE env_file_id = ? ORDER BY created_at DESC, rowid DESC",
  )
    .bind(file.id)
    .all<{ id: string; created_at: string }>();

  return c.json({
    versions: rows.results.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      isCurrent: r.id === file.current_version_id,
    })),
  });
});

// A specific version's opaque blob (for viewing / restoring in-browser).
structure.get("/files/:id/versions/:vid", async (c) => {
  const file = await fileForUser(c.env.DB, c.get("user").id, c.req.param("id"));
  if (!file) return c.json({ ok: false, error: "Not found" }, 404);

  const row = await c.env.DB.prepare(
    "SELECT id, blob, created_at FROM env_versions WHERE id = ? AND env_file_id = ?",
  )
    .bind(c.req.param("vid"), file.id)
    .first<{ id: string; blob: string; created_at: string }>();
  if (!row) return c.json({ ok: false, error: "Not found" }, 404);

  return c.json({
    version: { id: row.id, blob: JSON.parse(row.blob), createdAt: row.created_at },
  });
});

// Save a new version: insert the blob and atomically advance current_version_id.
structure.post("/files/:id/versions", async (c) => {
  const file = await fileForUser(c.env.DB, c.get("user").id, c.req.param("id"));
  if (!file) return c.json({ ok: false, error: "Not found" }, 404);

  const body = (await c.req.json().catch(() => ({}))) as { blob?: unknown };
  if (!isBlob(body.blob)) return c.json({ ok: false, error: "Invalid blob" }, 400);

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO env_versions (id, env_file_id, blob, created_at) VALUES (?, ?, ?, ?)",
    ).bind(id, file.id, JSON.stringify(body.blob), createdAt),
    c.env.DB.prepare("UPDATE env_files SET current_version_id = ? WHERE id = ?").bind(
      id,
      file.id,
    ),
  ]);

  return c.json({ id, createdAt }, 201);
});
