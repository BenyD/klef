// Config consumed ONLY by `@better-auth/cli generate` to emit the D1 schema.
// It mirrors the runtime auth options exactly (via buildAuthOptions) but swaps
// the D1 binding for an in-memory better-sqlite3 DB the CLI can introspect.
// Never imported by the Worker or the client.
import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import { buildAuthOptions } from "./src/worker/auth.ts";

export const auth = betterAuth(
  buildAuthOptions({
    database: new Database(":memory:"),
    secret: "schema-generation-only-not-a-real-secret",
    baseURL: "http://localhost:5173",
    google: { clientId: "schema-gen", clientSecret: "schema-gen" },
  }),
);
