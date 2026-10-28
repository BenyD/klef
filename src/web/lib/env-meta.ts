import {
  isPresetEnvironment,
  type PresetEnvironment,
} from "../../shared/api-types.ts";
import {
  effectiveEnvironment,
  environmentWorthShowing,
} from "../../shared/env-from-name.ts";

// Environments are text, never colour. A file's name usually says its
// environment already (.env.local, .env.production), so the UI only prints
// one when it adds something: see environmentWorthShowing. Colour-coding
// was dropped on purpose: red read as an error, and a dot per file was noise
// on names that already said it.

/** Display labels for the preset environments. */
export const ENV_LABELS: Record<PresetEnvironment, string> = {
  development: "Development",
  preview: "Preview",
  production: "Production",
};

/** Display label for any environment: presets capitalized, custom as typed. */
export function envLabel(environment: string): string {
  return isPresetEnvironment(environment)
    ? ENV_LABELS[environment]
    : environment;
}

/**
 * The environment label to print next to a file, or null when its name
 * already says it (or nothing is set).
 */
export function envTag(name: string, environment: string | null): string | null {
  const shown = environmentWorthShowing(name, environment);
  return shown ? envLabel(shown) : null;
}

/**
 * The environment a file stands for, as a display label: its explicit one,
 * else the one its name implies. For search and grouping, where "production"
 * should find .env.production even though nothing labels it.
 */
export function effectiveEnvLabel(
  name: string,
  environment: string | null,
): string | null {
  const env = effectiveEnvironment(name, environment);
  return env ? envLabel(env) : null;
}
