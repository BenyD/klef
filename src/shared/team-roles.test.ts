import { describe, expect, it } from "vitest";
import {
  canManage,
  isCustomGrantList,
  isProductionLabel,
  isValidRolePreset,
  memberAccess,
  presetAccess,
} from "./team-roles.ts";

describe("presets", () => {
  it("keep developers and readers out of production, by any spelling", () => {
    for (const label of ["production", "prod", "Prod-EU", "preprod"]) expect(isProductionLabel(label)).toBe(true);
    for (const label of ["development", "preview", "staging", ""]) expect(isProductionLabel(label)).toBe(false);

    expect(presetAccess("developer", "development")).toBe("write");
    expect(presetAccess("developer", "production")).toBe("none");
    expect(presetAccess("read", "staging")).toBe("read");
    expect(presetAccess("read", "production")).toBe("none");
    expect(presetAccess("admin", "production")).toBe("write");
  });

  it("give admins everything and custom members exactly their grants", () => {
    const grants = [{ projectId: "p", environment: "production", access: "read" as const }];
    expect(memberAccess({ role: "admin", preset: "admin" }, "p", "production")).toBe("write");
    expect(memberAccess({ role: "member", preset: "custom" }, "p", "production", grants)).toBe("read");
    expect(memberAccess({ role: "member", preset: "custom" }, "p", "development", grants)).toBe("none");
    expect(memberAccess({ role: "member", preset: "custom" }, "q", "production", grants)).toBe("none");
    expect(memberAccess({ role: "member", preset: "developer" }, "p", "")).toBe("write");
  });
});

describe("who manages whom", () => {
  it("lets owners manage admins and members, admins only members, and nobody the owner", () => {
    expect(canManage("owner", "admin")).toBe(true);
    expect(canManage("owner", "member")).toBe(true);
    expect(canManage("admin", "member")).toBe(true);
    expect(canManage("admin", "admin")).toBe(false);
    expect(canManage("admin", "owner")).toBe(false);
    expect(canManage("owner", "owner")).toBe(false);
    expect(canManage("member", "member")).toBe(false);
  });

  it("pairs admins with the admin preset only", () => {
    expect(isValidRolePreset("admin", "admin")).toBe(true);
    expect(isValidRolePreset("admin", "developer")).toBe(false);
    expect(isValidRolePreset("member", "admin")).toBe(false);
    expect(isValidRolePreset("member", "custom")).toBe(true);
  });
});

describe("custom grant lists", () => {
  it("accept normalised, unique grants and refuse the rest", () => {
    expect(isCustomGrantList([{ projectId: "p", environment: "", access: "read" }])).toBe(true);
    expect(isCustomGrantList([{ projectId: "p", environment: "Production", access: "read" }])).toBe(false);
    expect(isCustomGrantList([{ projectId: "p", environment: "dev", access: "admin" }])).toBe(false);
    expect(
      isCustomGrantList([
        { projectId: "p", environment: "dev", access: "read" },
        { projectId: "p", environment: "dev", access: "write" },
      ]),
    ).toBe(false);
    expect(isCustomGrantList("nope")).toBe(false);
  });
});
