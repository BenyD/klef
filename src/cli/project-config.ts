// SPDX-License-Identifier: AGPL-3.0-or-later
//
// `.klef.json` — the per-repo link between a working directory and a file in
// the vault. Committed, and deliberately free of anything secret: it holds
// names, which Klef stores in plaintext anyway.

export const CONFIG_FILENAME = ".klef.json";

export interface ProjectConfig {
  workspace: string;
  project: string;
  /** The env file's name in the vault, e.g. ".env" or ".env.local". */
  file: string;
  /** Optional label; null when the file has none. */
  environment: string | null;
}

export class ConfigError extends Error {}

function requireName(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(`${CONFIG_FILENAME}: "${field}" must be a non-empty string`);
  }
  return value.trim();
}

export function parseProjectConfig(raw: string): ProjectConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError(`${CONFIG_FILENAME} is not valid JSON`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ConfigError(`${CONFIG_FILENAME} must contain a JSON object`);
  }

  const obj = parsed as Record<string, unknown>;
  const environment = obj.environment;
  if (environment !== undefined && environment !== null && typeof environment !== "string") {
    throw new ConfigError(`${CONFIG_FILENAME}: "environment" must be a string or null`);
  }

  return {
    workspace: requireName(obj.workspace, "workspace"),
    project: requireName(obj.project, "project"),
    file: requireName(obj.file, "file"),
    environment: typeof environment === "string" && environment.trim() !== ""
      ? environment.trim()
      : null,
  };
}

/** Trailing newline so the file is well-formed for humans and diffs. */
export function serializeProjectConfig(config: ProjectConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}
