import { describe, expect, it } from "vitest";
import { defaultFileList, defaultLinkedFile, environmentFor } from "./default-files.ts";

describe("defaultLinkedFile", () => {
  it("prefers .env.local, then .env.production, from the vault", () => {
    expect(defaultLinkedFile([".env.production", ".env.local"])).toBe(".env.local");
    expect(defaultLinkedFile([".env.production", ".env"])).toBe(".env.production");
  });

  it("falls back to .env, as link did before defaults", () => {
    expect(defaultLinkedFile([".env", "mobile.env"])).toBe(".env");
    expect(defaultLinkedFile([])).toBe(".env");
  });

  it("matches names case-insensitively, like the vault", () => {
    expect(defaultLinkedFile([".ENV.LOCAL"])).toBe(".env.local");
  });
});

describe("defaultFileList", () => {
  it("records both conventional files when the vault has them", () => {
    expect(defaultFileList(".env.local", [".env.local", ".env.production"], [])).toEqual([
      { file: ".env.local", path: ".env.local" },
      { file: ".env.production", path: ".env.production" },
    ]);
  });

  it("records a file that exists only here, so sync can create it", () => {
    expect(defaultFileList(".env.local", [".env.local"], [".env.production"])).toEqual([
      { file: ".env.local", path: ".env.local" },
      { file: ".env.production", path: ".env.production" },
    ]);
  });

  it("keeps a non-default linked file first rather than dropping it", () => {
    expect(defaultFileList(".env", [".env", ".env.local"], [])?.map((e) => e.file)).toEqual([
      ".env",
      ".env.local",
    ]);
  });

  it("takes the vault's casing for a name it has", () => {
    expect(defaultFileList(".env.local", [".env.local", ".ENV.PRODUCTION"], [])?.[1]?.file).toBe(
      ".ENV.PRODUCTION",
    );
  });

  it("returns null when the list would be the linked file alone", () => {
    expect(defaultFileList(".env.local", [".env.local"], [])).toBeNull();
    expect(defaultFileList(".env", [".env"], [])).toBeNull();
  });
});

describe("environmentFor", () => {
  it("labels the conventional names and nothing else", () => {
    expect(environmentFor(".env.local")).toBe("development");
    expect(environmentFor(".env.production")).toBe("production");
    expect(environmentFor("mobile.env")).toBeNull();
  });
});
