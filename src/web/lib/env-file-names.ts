import type { Environment, Framework } from "../../shared/api-types.ts";

/** Display names for the tech-stack picker. */
export const FRAMEWORK_LABELS: Record<Framework, string> = {
  nextjs: "Next.js",
  vite: "Vite",
  nuxt: "Nuxt",
  sveltekit: "SvelteKit",
  astro: "Astro",
  remix: "Remix",
  expo: "Expo",
  node: "Node.js",
  bun: "Bun",
  deno: "Deno",
  go: "Go",
  django: "Django",
  flask: "Flask",
  fastapi: "FastAPI",
  rails: "Rails",
  laravel: "Laravel",
  spring: "Spring",
  dotnet: ".NET",
  postgres: "PostgreSQL",
  mysql: "MySQL",
  sqlite: "SQLite",
  redis: "Redis",
  prisma: "Prisma",
  supabase: "Supabase",
  firebase: "Firebase",
  docker: "Docker",
  other: "Other",
};

/** Picker sections ("Tech stack" in the UI, `framework` in the data model). */
export const STACK_GROUPS: { label: string; stacks: Framework[] }[] = [
  {
    label: "Frontend & full-stack",
    stacks: ["nextjs", "vite", "nuxt", "sveltekit", "astro", "remix", "expo"],
  },
  {
    label: "Backend",
    stacks: [
      "node",
      "bun",
      "deno",
      "go",
      "django",
      "flask",
      "fastapi",
      "rails",
      "laravel",
      "spring",
      "dotnet",
    ],
  },
  {
    label: "Databases & services",
    stacks: [
      "postgres",
      "mysql",
      "sqlite",
      "redis",
      "prisma",
      "supabase",
      "firebase",
      "docker",
    ],
  },
  { label: "Other", stacks: ["other"] },
];

type Names = Record<Exclude<Environment, never> | "none", string>;

const GENERIC: Names = {
  development: ".env.local",
  preview: ".env.preview",
  production: ".env.production",
  none: ".env",
};

// Server-side stacks (and services configured via a plain dotenv file)
// conventionally use .env during development rather than .env.local.
const SERVER: Names = { ...GENERIC, development: ".env" };

// Per-stack conventions; only deviations from GENERIC are spelled out.
// Laravel notably uses a single plain .env everywhere; Rails (dotenv gem)
// prefers .env.development.
const NAMES: Record<Framework, Names> = {
  nextjs: GENERIC,
  vite: { ...GENERIC, preview: ".env.staging" },
  sveltekit: { ...GENERIC, preview: ".env.staging" },
  astro: { ...GENERIC, preview: ".env.staging" },
  expo: GENERIC,
  nuxt: SERVER,
  remix: SERVER,
  node: SERVER,
  bun: SERVER,
  deno: SERVER,
  go: SERVER,
  django: SERVER,
  flask: SERVER,
  fastapi: SERVER,
  spring: SERVER,
  dotnet: SERVER,
  rails: {
    development: ".env.development",
    preview: ".env.staging",
    production: ".env.production",
    none: ".env",
  },
  laravel: {
    development: ".env",
    preview: ".env",
    production: ".env",
    none: ".env",
  },
  postgres: SERVER,
  mysql: SERVER,
  sqlite: SERVER,
  redis: SERVER,
  prisma: SERVER,
  supabase: SERVER,
  firebase: SERVER,
  docker: SERVER,
  other: GENERIC,
};

/** Conventional env-file name for a stack + environment combination. */
export function defaultEnvFileName(
  framework: Framework | null,
  environment: Environment | null,
): string {
  return NAMES[framework ?? "other"][environment ?? "none"];
}
