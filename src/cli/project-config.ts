// SPDX-License-Identifier: MIT
//
// `.klef.json` — the per-repo link between a working directory and a file in
// the vault. Committed, and deliberately free of anything secret: it holds
// names, which Klef stores in plaintext anyway.

import { CliError } from "./ui.ts";

export const CONFIG_FILENAME = ".klef.json";

export interface ProjectConfig {
  workspace: string;
  project: string;
  /** The env file's name in the vault, e.g. ".env" or ".env.local". */
  file: string;
  /** Optional label; null when the file has none. */
  environment: string | null;
  /**
   * Every env file this repo syncs, for `push --all` / `pull --all`. Optional:
   * a config without it syncs the linked file alone. `path` is where the file
   * lives locally, relative to the repo, and defaults to the vault name, so a
   * vault file called "mobile.env.local" can live at apps/mobile/.env.local.
   */
  files?: FileEntry[];
  /**
   * Which local file `klef audit` compares each platform scope with, when
   * the conventional one is not it: { "vercel:preview": "apps/web/.env.preview",
   * "cloudflare:workers/image": "workers/image/.dev.vars" }.
   */
  audit?: Record<string, string>;
  /** The oldest CLI this link expects, e.g. "0.7.0" (min-version.ts). */
  minVersion?: string;
}

export interface FileEntry {
  /** The env file's name in the vault. */
  file: string;
  /** Where it lives in the working tree, relative to `.klef.json`. */
  path: string;
}

export class ConfigError extends CliError {
  constructor(message: string) {
    super("usage", message);
  }
}

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

  const config: ProjectConfig = {
    workspace: requireName(obj.workspace, "workspace"),
    project: requireName(obj.project, "project"),
    file: requireName(obj.file, "file"),
    environment: typeof environment === "string" && environment.trim() !== ""
      ? environment.trim()
      : null,
  };
  if (obj.files !== undefined) config.files = parseFiles(obj.files);
  if (obj.audit !== undefined) {
    const audit = obj.audit;
    if (typeof audit !== "object" || audit === null || Array.isArray(audit) || Object.values(audit).some((v) => typeof v !== "string" || v === "")) {
      throw new ConfigError(`${CONFIG_FILENAME}: "audit" must map scopes to file paths, like {"vercel:preview": ".env.preview"}`);
    }
    config.audit = audit as Record<string, string>;
  }
  if (obj.minVersion !== undefined) {
    if (typeof obj.minVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(obj.minVersion)) {
      throw new ConfigError(`${CONFIG_FILENAME}: "minVersion" must be a version like "0.7.0"`);
    }
    config.minVersion = obj.minVersion;
  }
  return config;
}

/**
 * Validate the `files` list. Paths are only checked for shape here; whether
 * one escapes the working directory is decided by resolveWritePath at the
 * moment it is used, against the real cwd, so there is one rule and one place
 * that enforces it.
 */
function parseFiles(value: unknown): FileEntry[] {
  if (!Array.isArray(value)) {
    throw new ConfigError(`${CONFIG_FILENAME}: "files" must be an array`);
  }

  const entries = value.map((item, i): FileEntry => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new ConfigError(`${CONFIG_FILENAME}: "files[${i}]" must be an object`);
    }
    const entry = item as Record<string, unknown>;
    const file = requireName(entry.file, `files[${i}].file`);
    const local = entry.path === undefined ? file : requireName(entry.path, `files[${i}].path`);
    return { file, path: local };
  });

  if (entries.length === 0) {
    throw new ConfigError(`${CONFIG_FILENAME}: "files" is empty; list a file or remove it`);
  }

  // Two entries for one vault file, or two vault files written to one path,
  // would make --all depend on the order it happened to run in.
  const seenFiles = new Set<string>();
  const seenPaths = new Set<string>();
  for (const { file, path: local } of entries) {
    const fileKey = file.toLowerCase();
    if (seenFiles.has(fileKey)) {
      throw new ConfigError(`${CONFIG_FILENAME}: "${file}" is listed in "files" twice`);
    }
    if (seenPaths.has(local)) {
      throw new ConfigError(`${CONFIG_FILENAME}: two entries in "files" use the path "${local}"`);
    }
    seenFiles.add(fileKey);
    seenPaths.add(local);
  }

  return entries;
}

/**
 * The files `--all` covers: the `files` list when there is one, otherwise the
 * linked file at its own name.
 */
export function allFiles(config: ProjectConfig): FileEntry[] {
  return config.files ?? [{ file: config.file, path: config.file }];
}

/**
 * Where a vault file lives locally according to its `files` entry, matching
 * names case-insensitively as the vault does. Null when it has no entry, which
 * leaves the default to the caller.
 */
export function localPathFor(config: ProjectConfig, file: string): string | null {
  const wanted = file.toLowerCase();
  return config.files?.find((entry) => entry.file.toLowerCase() === wanted)?.path ?? null;
}

/** Trailing newline so the file is well-formed for humans and diffs. */
export function serializeProjectConfig(config: ProjectConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}
