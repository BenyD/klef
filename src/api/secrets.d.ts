// Secrets delivered via `.dev.vars` locally and `wrangler secret` in production.
// These are NOT in wrangler.jsonc, so `wrangler types` doesn't know about them —
// declare them here so the Worker's `Env` is fully typed.
declare global {
  interface Env {
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
  }
}

export {};
