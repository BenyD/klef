// SPDX-License-Identifier: MIT
//
// Who can do what in a team workspace (docs/SHARING_DESIGN.md, section 7).
// Pure rules shared by the server, which enforces them, and the clients,
// which show them and decide whose keys to wrap.
//
// Two layers: a workspace role (owner, admin, member), and for members a
// preset that decides their access to each environment of each project.
// Owners and admins reach everything. A custom preset is exactly the grants
// an admin chose.

import { normalizeEnvironment } from "./api-types.ts";

export type TeamRole = "owner" | "admin" | "member";
export type MemberPreset = "admin" | "developer" | "read" | "custom";
export type EnvAccess = "none" | "read" | "write";

export const MEMBER_PRESETS: readonly MemberPreset[] = ["admin", "developer", "read", "custom"];

/** One explicit grant, for the custom preset. */
export interface CustomGrant {
  projectId: string;
  /** The environment label, "" for unlabelled files. */
  environment: string;
  access: "read" | "write";
}

/**
 * Environments the presets keep members out of: any label containing
 * "prod", in any case ("production", "prod", "Prod-EU").
 */
export function isProductionLabel(environment: string): boolean {
  return /prod/i.test(environment);
}

/** What a preset gives a member on one environment. */
export function presetAccess(preset: Exclude<MemberPreset, "custom">, environment: string): EnvAccess {
  if (preset === "admin") return "write";
  if (isProductionLabel(environment)) return "none";
  return preset === "developer" ? "write" : "read";
}

/** Owners and admins hold the workspace key and reach every environment. */
export function isAdmin(role: TeamRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Can `actor` change or remove `target`? Owners manage everyone else;
 * admins manage members; nobody manages the owner.
 */
export function canManage(actor: TeamRole, target: TeamRole): boolean {
  if (target === "owner") return false;
  if (actor === "owner") return true;
  return actor === "admin" && target === "member";
}

/** The role and preset that go together: admins always use the admin preset. */
export function isValidRolePreset(role: TeamRole, preset: MemberPreset): boolean {
  return isAdmin(role) ? preset === "admin" : preset !== "admin";
}

/** Shape check for a custom grant list from the wire. Labels must be normalised. */
export function isCustomGrantList(v: unknown): v is CustomGrant[] {
  if (!Array.isArray(v) || v.length > 1000) return false;
  const seen = new Set<string>();
  for (const g of v) {
    if (typeof g !== "object" || g === null) return false;
    const r = g as Record<string, unknown>;
    if (typeof r.projectId !== "string" || typeof r.environment !== "string") return false;
    if (r.access !== "read" && r.access !== "write") return false;
    if (r.environment !== "" && normalizeEnvironment(r.environment) !== r.environment) return false;
    const key = `${r.projectId}\n${r.environment}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

/**
 * A member's access to one environment, from their role and preset, and for
 * the custom preset their explicit grants.
 */
export function memberAccess(
  member: { role: TeamRole; preset: MemberPreset },
  projectId: string,
  environment: string,
  grants: readonly CustomGrant[] = [],
): EnvAccess {
  if (isAdmin(member.role)) return "write";
  if (member.preset === "custom") {
    return grants.find((g) => g.projectId === projectId && g.environment === environment)?.access ?? "none";
  }
  return presetAccess(member.preset, environment);
}
