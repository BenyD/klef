// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Where the CLI keeps its state. Resolution is a pure function of the
// environment and home directory so it can be tested without touching a real
// filesystem or a real HOME.

import path from "node:path";

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
 * Where the unlock agent listens. Kept out of the config directory: this is a
 * runtime socket, and XDG_RUNTIME_DIR is already tmpfs, user-owned, and cleared
 * on logout — exactly the lifetime an in-memory key should have.
 */
export function agentSocketPath(env: NodeJS.ProcessEnv, homedir: string): string {
  if (env.KLEF_AGENT_SOCK) return env.KLEF_AGENT_SOCK;
  const runtime = env.XDG_RUNTIME_DIR;
  return runtime
    ? path.join(runtime, "klef-agent.sock")
    : path.join(configDir(env, homedir), "agent.sock");
}

export function credentialsFile(env: NodeJS.ProcessEnv, homedir: string): string {
  return path.join(configDir(env, homedir), "credentials.json");
}

/** The API the CLI talks to. Overridable so a self-hoster can point at their own. */
export function apiBaseUrl(env: NodeJS.ProcessEnv): string {
  const raw = env.KLEF_API_URL?.trim();
  if (!raw) return "https://klef.sh";
  return raw.replace(/\/+$/, "");
}
