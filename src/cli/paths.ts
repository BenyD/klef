// SPDX-License-Identifier: MIT
//
// Where the CLI keeps its state. Resolution is a pure function of the
// environment and home directory so it can be tested without touching a real
// filesystem or a real HOME.

import path from "node:path";
import { CliError } from "./ui.ts";

/** Directory holding the credentials fallback file. XDG on Unix, APPDATA on Windows. */
export function configDir(env: NodeJS.ProcessEnv, homedir: string): string {
  if (env.KLEF_CONFIG_DIR) return env.KLEF_CONFIG_DIR;
  if (process.platform === "win32" && env.APPDATA) {
    return path.join(env.APPDATA, "klef");
  }
  const xdg = env.XDG_CONFIG_HOME;
  return xdg ? path.join(xdg, "klef") : path.join(homedir, ".config", "klef");
}

/**
 * Where the unlock agent listens. XDG_RUNTIME_DIR is preferred: tmpfs,
 * user-owned, mode 0700, and cleared on logout, which is exactly the lifetime
 * an in-memory key should have. macOS has no equivalent set, so the fallback is
 * a `run` directory of klef's own under the config directory, created 0700 and
 * checked before use (socket-dir.ts). A dedicated directory rather than the
 * config directory itself, whose mode klef does not always control.
 */
export function agentSocketPath(env: NodeJS.ProcessEnv, homedir: string): string {
  if (env.KLEF_AGENT_SOCK) return env.KLEF_AGENT_SOCK;
  const runtime = env.XDG_RUNTIME_DIR;
  return runtime
    ? path.join(runtime, "klef-agent.sock")
    : path.join(configDir(env, homedir), "run", "agent.sock");
}

/** The default server, whose token keeps the names it has always had. */
export const DEFAULT_API = "https://klef.sh";

/**
 * Where a server's token is kept: one per server, so a token issued by one is
 * never sent to another. klef.sh keeps the original names; any other server
 * gets its own, named by origin.
 */
export function tokenSlot(env: NodeJS.ProcessEnv): string | null {
  const base = apiBaseUrl(env);
  return base === DEFAULT_API ? null : new URL(base).host.replace(/[^a-zA-Z0-9.-]/g, "_");
}

export function credentialsFile(env: NodeJS.ProcessEnv, homedir: string): string {
  const slot = tokenSlot(env);
  return path.join(configDir(env, homedir), slot ? `credentials-${slot}.json` : "credentials.json");
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The API the CLI talks to. Overridable so a self-hoster can point at their
 * own, over https: the access token goes in every request, so plain http is
 * refused except to this machine.
 */
export function apiBaseUrl(env: NodeJS.ProcessEnv): string {
  const raw = env.KLEF_API_URL?.trim();
  if (!raw) return DEFAULT_API;
  const base = raw.replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new CliError("usage", `KLEF_API_URL is not a URL (${base})`);
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname))) {
    throw new CliError("usage", `KLEF_API_URL must use https, except for localhost (${base})`);
  }
  return base;
}
