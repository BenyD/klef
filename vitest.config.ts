import path from "node:path";
import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

// Two test surfaces:
//   - "unit"   : pure crypto + client logic in a fast node/happy-dom env.
//   - "worker" : Hono routes + D1 inside the real workerd runtime (Miniflare),
//                with our migrations applied to an isolated local D1 per run.
export default defineConfig(async () => {
  const migrations = await readD1Migrations(
    path.join(import.meta.dirname, "db/migrations"),
  );

  return {
    test: {
      projects: [
        {
          test: {
            name: "unit",
            environment: "node",
            include: [
              "src/shared/**/*.test.ts",
              "src/web/**/*.test.{ts,tsx}",
            ],
          },
        },
        {
          plugins: [
            cloudflareTest({
              wrangler: { configPath: "./wrangler.jsonc" },
              miniflare: {
                bindings: {
                  // Migrations handed to the setup file to apply to local D1.
                  TEST_MIGRATIONS: migrations,
                  // Auth secrets — real values come from .dev.vars / wrangler
                  // secrets; tests just need them present and well-formed.
                  BETTER_AUTH_SECRET: "test-secret-please-ignore-32chars-minimum",
                  BETTER_AUTH_URL: "https://klef.test",
                  GOOGLE_CLIENT_ID: "test-google-client-id",
                  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
                },
              },
            }),
          ],
          test: {
            name: "worker",
            include: ["src/api/**/*.test.ts"],
            setupFiles: ["./test/apply-migrations.ts"],
          },
        },
      ],
    },
  };
});
