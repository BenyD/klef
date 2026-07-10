import { useCallback, useMemo } from "react";
import {
  isPresetEnvironment,
  type PresetEnvironment,
} from "../../shared/api-types.ts";
import {
  parseEnvLabels,
  useEnvLabelsRaw,
  type EnvLabelOverrides,
} from "./preferences.ts";

// Lives apart from EnvBadge.tsx so that file exports only a component and
// stays Fast Refresh-able.
/** Default display labels + dot colors for the preset environments. */
export const ENV_META: Record<PresetEnvironment, { label: string; dot: string }> = {
  development: { label: "Development", dot: "bg-env-development" },
  preview: { label: "Preview", dot: "bg-env-preview" },
  production: { label: "Production", dot: "bg-env-production" },
};

/**
 * Meta for any label: presets get their colors (and any renamed display
 * label), custom labels share one. Dots never depend on overrides, so
 * dot-only call sites can skip the hook and pass no overrides.
 */
export function envMeta(
  environment: string,
  overrides?: EnvLabelOverrides,
): { label: string; dot: string } {
  if (!isPresetEnvironment(environment)) {
    return { label: environment, dot: "bg-env-custom" };
  }
  const meta = ENV_META[environment];
  const renamed = overrides?.[environment];
  return renamed ? { label: renamed, dot: meta.dot } : meta;
}

/** envMeta bound to the device's label renames; updates live with settings. */
export function useEnvMeta(): (environment: string) => {
  label: string;
  dot: string;
} {
  const raw = useEnvLabelsRaw();
  const overrides = useMemo(() => parseEnvLabels(raw), [raw]);
  return useCallback((environment) => envMeta(environment, overrides), [
    overrides,
  ]);
}
