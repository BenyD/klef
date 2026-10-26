import { useCallback, useMemo } from "react";
import {
  isPresetEnvironment,
  type PresetEnvironment,
} from "../../shared/api-types.ts";
import {
  effectiveEnvironment,
  environmentWorthShowing,
} from "../../shared/env-from-name.ts";
import {
  parseEnvLabels,
  useEnvLabelsRaw,
  type EnvLabelOverrides,
} from "./preferences.ts";

// Environments are text, never colour. A file's name usually says its
// environment already (.env.local, .env.production), so the UI only prints
// one when it adds something: see environmentWorthShowing. Colour-coding
// was dropped on purpose: red read as an error, and a dot per file was noise
// on names that already said it.

/** Default display labels for the preset environments. */
export const ENV_META: Record<PresetEnvironment, { label: string }> = {
  development: { label: "Development" },
  preview: { label: "Preview" },
  production: { label: "Production" },
};

/**
 * Display meta for any environment: presets get their label (or the
 * device's rename of it), custom labels show as typed.
 */
export function envMeta(
  environment: string,
  overrides?: EnvLabelOverrides,
): { label: string } {
  if (!isPresetEnvironment(environment)) return { label: environment };
  return { label: overrides?.[environment] || ENV_META[environment].label };
}

/** envMeta bound to the device's label renames; updates live with settings. */
export function useEnvMeta(): (environment: string) => { label: string } {
  const raw = useEnvLabelsRaw();
  const overrides = useMemo(() => parseEnvLabels(raw), [raw]);
  return useCallback((environment) => envMeta(environment, overrides), [
    overrides,
  ]);
}

/**
 * The environment label to print next to a file, or null when its name
 * already says it (or nothing is set). Renamed presets use their rename.
 */
export function useEnvTag(): (
  name: string,
  environment: string | null,
) => string | null {
  const meta = useEnvMeta();
  return useCallback(
    (name, environment) => {
      const shown = environmentWorthShowing(name, environment);
      return shown ? meta(shown).label : null;
    },
    [meta],
  );
}

/**
 * The environment a file stands for, as a display label: its explicit one,
 * else the one its name implies. For search and grouping, where "production"
 * should find .env.production even though nothing labels it.
 */
export function useEffectiveEnvLabel(): (
  name: string,
  environment: string | null,
) => string | null {
  const meta = useEnvMeta();
  return useCallback(
    (name, environment) => {
      const env = effectiveEnvironment(name, environment);
      return env ? meta(env).label : null;
    },
    [meta],
  );
}
