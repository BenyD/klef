import { Box } from "lucide-react";
import {
  siAstro,
  siBun,
  siDeno,
  siDjango,
  siDocker,
  siDotnet,
  siExpo,
  siFastapi,
  siFirebase,
  siFlask,
  siGo,
  siLaravel,
  siMysql,
  siNextdotjs,
  siNodedotjs,
  siNuxt,
  siPostgresql,
  siPrisma,
  siRedis,
  siRemix,
  siRubyonrails,
  siSpring,
  siSqlite,
  siSupabase,
  siSvelte,
  siVite,
  type SimpleIcon,
} from "simple-icons";
import { cn } from "../lib/utils.ts";
import type { Framework } from "../../shared/api-types.ts";

// Monochrome brand marks (fill: currentColor) so they sit quietly in the
// neutral UI; "other" falls back to a generic lucide box.
const ICONS: Record<Exclude<Framework, "other">, SimpleIcon> = {
  nextjs: siNextdotjs,
  vite: siVite,
  nuxt: siNuxt,
  sveltekit: siSvelte,
  astro: siAstro,
  remix: siRemix,
  expo: siExpo,
  node: siNodedotjs,
  bun: siBun,
  deno: siDeno,
  go: siGo,
  django: siDjango,
  flask: siFlask,
  fastapi: siFastapi,
  rails: siRubyonrails,
  laravel: siLaravel,
  spring: siSpring,
  dotnet: siDotnet,
  postgres: siPostgresql,
  mysql: siMysql,
  sqlite: siSqlite,
  redis: siRedis,
  prisma: siPrisma,
  supabase: siSupabase,
  firebase: siFirebase,
  docker: siDocker,
};

export function FrameworkIcon({
  framework,
  className,
}: {
  framework: Framework;
  className?: string;
}) {
  if (framework === "other") {
    return <Box className={cn("size-4", className)} aria-hidden="true" />;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("size-4 shrink-0 fill-current", className)}
    >
      <path d={ICONS[framework].path} />
    </svg>
  );
}
