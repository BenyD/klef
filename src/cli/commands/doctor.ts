// SPDX-License-Identifier: MIT
//
// `klef doctor`: what a bug report needs, in one paste. The versions, the
// machine, the server and whether it answers, where the token and the vault
// key are kept, what this directory is linked to and which kits were set up
// from here. Names, versions and yes or no only: never a value, a token, a
// key or a licence key, so the output is safe to post in a public issue.
// It sends nothing anywhere but the server's health check.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { arch, homedir, platform, release } from "node:os";
import path from "node:path";
import type { ParsedArgs } from "../args.ts";
import { agentStatus } from "../agent-client.ts";
import { loadToken } from "../credentials.ts";
import { invocationName } from "../invocation.ts";
import { rememberedKeySource } from "../key-store.ts";
import { kitStateFile, type KitState } from "../kit-lib.ts";
import { agentSocketPath, apiBaseUrl, configDir } from "../paths.ts";
import { readProjectConfig } from "../project-file.ts";
import { emit, ISSUES_URL, say, style } from "../ui.ts";
import { CLI_VERSION } from "../version.ts";

export interface DoctorReport {
  cli: string;
  node: string;
  os: string;
  invokedAs: string;
  configDir: string;
  server: { url: string; reachable: boolean };
  signedIn: boolean;
  tokenStore: "keychain" | "file" | "environment" | null;
  vault: { keyRemembered: "keychain" | "file" | null; unlockAgent: boolean };
  project: { workspace: string; project: string; file: string } | null;
  kits: { workerName: string; version: string | null; deployed: boolean }[];
}

async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Kit deployments set up from this machine, by name and version only. */
function kits(dir: string): DoctorReport["kits"] {
  const folder = path.dirname(kitStateFile(dir, "x"));
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => {
      try {
        const s = JSON.parse(readFileSync(path.join(folder, f), "utf8")) as KitState;
        return [{ workerName: s.workerName, version: s.version ?? null, deployed: Boolean(s.url) }];
      } catch {
        return [];
      }
    });
}

export async function collectDoctor(env: NodeJS.ProcessEnv, cwd: string): Promise<DoctorReport> {
  const dir = configDir(env, homedir());
  let server = "(KLEF_API_URL is not a valid https URL)";
  try {
    server = apiBaseUrl(env);
  } catch {
    // Reported as is; the check below then fails, which is the point.
  }
  const [token, key, agent, config, up] = await Promise.all([
    loadToken(env).catch(() => null),
    rememberedKeySource(env).catch(() => null),
    agentStatus(agentSocketPath(env, homedir())).catch(() => null),
    readProjectConfig(cwd).catch(() => null),
    server.startsWith("http") ? reachable(server) : Promise.resolve(false),
  ]);
  return {
    cli: CLI_VERSION,
    node: process.version,
    os: `${platform()} ${release()} ${arch()}`,
    invokedAs: invocationName(),
    // Home as ~, so a public issue doesn't carry the account's username.
    configDir: dir.startsWith(homedir()) ? `~${dir.slice(homedir().length)}` : dir,
    server: { url: server, reachable: up },
    signedIn: Boolean(token),
    tokenStore: token?.source ?? null,
    vault: { keyRemembered: key, unlockAgent: Boolean(agent) },
    project: config ? { workspace: config.workspace, project: config.project, file: config.file } : null,
    kits: kits(dir),
  };
}

export async function doctor(_args: ParsedArgs, env: NodeJS.ProcessEnv, cwd: string): Promise<number> {
  const r = await collectDoctor(env, cwd);
  emit({ ...r });
  const rows: [string, string][] = [
    ["Klef CLI", r.cli],
    ["Node", r.node],
    ["OS", r.os],
    ["Run as", r.invokedAs],
    ["Config", r.configDir],
    ["Server", `${r.server.url} (${r.server.reachable ? "answers" : "not answering"})`],
    ["Signed in", r.signedIn ? `yes, token in ${r.tokenStore}` : "no"],
    ["Vault key", r.vault.keyRemembered ? `remembered in ${r.vault.keyRemembered}` : "not remembered"],
    ["Unlock agent", r.vault.unlockAgent ? "running" : "not running"],
    ["Linked", r.project ? `${r.project.workspace} / ${r.project.project} (${r.project.file})` : "no"],
    ["Kits", r.kits.length ? r.kits.map((k) => `${k.workerName} ${k.version ?? "(not deployed)"}`).join(", ") : "none"],
  ];
  const width = Math.max(...rows.map(([k]) => k.length));
  for (const [k, v] of rows) say(`${style.dim(k.padEnd(width))}  ${v}`);
  say("");
  say(`Nothing above is secret, so it is safe to paste into a bug report: ${ISSUES_URL}`);
  return 0;
}
