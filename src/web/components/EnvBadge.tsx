import { cn } from "../lib/utils.ts";
import type { Environment } from "../../shared/api-types.ts";
import { Badge } from "./ui/badge.tsx";

/** Short display labels + dot colors for the fixed environment set. */
export const ENV_META: Record<Environment, { label: string; dot: string }> = {
  development: { label: "dev", dot: "bg-sky-500" },
  preview: { label: "preview", dot: "bg-amber-500" },
  production: { label: "prod", dot: "bg-rose-500" },
};

export function EnvBadge({
  environment,
  className,
}: {
  environment: Environment;
  className?: string;
}) {
  const meta = ENV_META[environment];
  return (
    <Badge
      variant="outline"
      className={cn("text-muted-foreground gap-1.5 font-normal", className)}
    >
      <span
        className={cn("size-1.5 shrink-0 rounded-full", meta.dot)}
        aria-hidden="true"
      />
      {meta.label}
    </Badge>
  );
}
