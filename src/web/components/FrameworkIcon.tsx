import type { CSSProperties } from "react";
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

// Brand marks in their official colors (see FILL_CLASS for the contrast
// guard); "other" falls back to a generic lucide box.
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

// Relative luminance of a brand hex, for the contrast guard below.
function luminance(hex: string): number {
  const n = parseInt(hex, 16);
  const lin = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return (
    0.2126 * lin(((n >> 16) & 255) / 255) +
    0.7152 * lin(((n >> 8) & 255) / 255) +
    0.0722 * lin((n & 255) / 255)
  );
}

// Marks render in their brand color, except where the brand would vanish:
// near-black logos (Next.js, Expo) fall back to the text color in dark mode,
// near-white ones (Bun) in light mode.
const FILL_CLASS: Record<Exclude<Framework, "other">, string> = Object.
  fromEntries(
    Object.entries(ICONS).map(([key, icon]) => {
      const l = luminance(icon.hex);
      const fill =
        l < 0.15
          ? "fill-(--brand) dark:fill-current"
          : l > 0.85
            ? "fill-current dark:fill-(--brand)"
            : "fill-(--brand)";
      return [key, fill];
    }),
  ) as Record<Exclude<Framework, "other">, string>;

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
  const icon = ICONS[framework];
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ "--brand": `#${icon.hex}` } as CSSProperties}
      className={cn("size-4 shrink-0", FILL_CLASS[framework], className)}
    >
      <path d={icon.path} />
    </svg>
  );
}
