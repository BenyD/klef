import {
  isPresetEnvironment,
  type PresetEnvironment,
} from "../../shared/api-types.ts";

// Lives apart from EnvBadge.tsx so that file exports only a component and
// stays Fast Refresh-able.
/** Display labels + dot colors for the preset environments. */
export const ENV_META: Record<PresetEnvironment, { label: string; dot: string }> = {
  development: { label: "Development", dot: "bg-sky-500" },
  preview: { label: "Preview", dot: "bg-amber-500" },
  production: { label: "Production", dot: "bg-rose-500" },
};

/** Meta for any label: presets get their colors, custom labels share one. */
export function envMeta(environment: string): { label: string; dot: string } {
  return isPresetEnvironment(environment)
    ? ENV_META[environment]
    : { label: environment, dot: "bg-violet-500" };
}
