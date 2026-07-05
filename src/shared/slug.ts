// Workspace URLs live at the site root (klef.sh/<slug>), so slugs must never
// collide with app or marketing routes — current ones or ones we plausibly
// add later. Enforced server-side on workspace create/rename.
export const RESERVED_SLUGS = new Set([
  "app",
  "api",
  "auth",
  "login",
  "logout",
  "signin",
  "sign-in",
  "signup",
  "sign-up",
  "security",
  "terms",
  "privacy",
  "legal",
  "about",
  "pricing",
  "changelog",
  "blog",
  "docs",
  "help",
  "support",
  "status",
  "contact",
  "settings",
  "account",
  "admin",
  "vault",
  "workspace",
  "workspaces",
  "project",
  "projects",
  "new",
  "home",
  "index",
  "assets",
  "public",
  "static",
  "cli",
  "download",
  "downloads",
  "onboarding",
  "unlock",
  "welcome",
]);

/** "Beny's Team" -> "benys-team". Lowercase ASCII letters/digits and dashes. */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents left by NFKD
    .replace(/['’]/g, "") // apostrophes vanish instead of becoming dashes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * URL segment for a workspace. Falls back to the id for legacy names with no
 * sluggable characters (new names like that are rejected server-side).
 */
export function workspaceSlug(name: string, id: string): string {
  return slugify(name) || id;
}
