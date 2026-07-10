import { cn } from "../lib/utils.ts";
import type { Environment } from "../../shared/api-types.ts";
import { useEnvMeta } from "../lib/env-meta.ts";
import { Badge } from "./ui/badge.tsx";

export function EnvBadge({
  environment,
  className,
}: {
  environment: Environment;
  className?: string;
}) {
  const meta = useEnvMeta()(environment);
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
