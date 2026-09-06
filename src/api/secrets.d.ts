// Secrets delivered via `.dev.vars` locally and `wrangler secret` in production.
// These are NOT in wrangler.jsonc, so `wrangler types` doesn't know about them —
// declare them here so the Worker's `Env` is fully typed.
//
// Also augment `Cloudflare.Env` (what `cloudflare:test` types `env` as). Wrangler
// may already list some of these on `__BaseEnv_Env`; GitHub was added later and
// must stay here until the next `pnpm cf-typegen` picks it up.
declare global {
  interface Env {
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
  }
  namespace Cloudflare {
    interface Env {
      GITHUB_CLIENT_ID: string;
      GITHUB_CLIENT_SECRET: string;
    }
  }
}

export {};
