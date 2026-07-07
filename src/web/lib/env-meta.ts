import type { Environment } from "../../shared/api-types.ts";

// Lives apart from EnvBadge.tsx so that file exports only a component and
// stays Fast Refresh-able.
/** Display labels + dot colors for the fixed environment set. */
export const ENV_META: Record<Environment, { label: string; dot: string }> = {
  development: { label: "Development", dot: "bg-sky-500" },
  preview: { label: "Preview", dot: "bg-amber-500" },
  production: { label: "Production", dot: "bg-rose-500" },
};
