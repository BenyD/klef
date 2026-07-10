import { describe, expect, it } from "vitest";
import { ENVIRONMENTS, FRAMEWORKS } from "../../shared/api-types.ts";
import { defaultEnvFileName } from "./env-file-names.ts";

describe("defaultEnvFileName", () => {
  it("covers every framework x environment combination", () => {
    for (const fw of [...FRAMEWORKS, null]) {
      for (const env of [...ENVIRONMENTS, null]) {
        const name = defaultEnvFileName(fw, env);
        expect(name, `${fw ?? "null"}/${env ?? "null"}`).toMatch(/^\.env/);
      }
    }
  });

  it("follows the notable per-framework conventions", () => {
    // No framework: the generic Vercel-ish set.
    expect(defaultEnvFileName(null, "development")).toBe(".env.local");
    expect(defaultEnvFileName(null, "production")).toBe(".env.production");
    expect(defaultEnvFileName(null, null)).toBe(".env");

    // Next.js keeps dev secrets in .env.local.
    expect(defaultEnvFileName("nextjs", "development")).toBe(".env.local");

    // Vite-family projects use custom modes for staging-like envs.
    expect(defaultEnvFileName("vite", "preview")).toBe(".env.staging");

    // Rails (dotenv gem) names the dev file explicitly.
    expect(defaultEnvFileName("rails", "development")).toBe(".env.development");

    // Laravel only ever has a plain .env.
    expect(defaultEnvFileName("laravel", "production")).toBe(".env");

    // Plain server stacks develop against .env directly.
    expect(defaultEnvFileName("node", "development")).toBe(".env");
  });

  it("suggests dotenv-style names for custom environments", () => {
    expect(defaultEnvFileName(null, "staging")).toBe(".env.staging");
    expect(defaultEnvFileName("nextjs", "QA 2")).toBe(".env.qa-2");
    expect(defaultEnvFileName("laravel", "staging")).toBe(".env.staging");
  });
});
