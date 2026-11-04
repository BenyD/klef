// SPDX-License-Identifier: MIT
//
// The pure half of `klef kit` (commands/kit.ts): everything about installing
// the self-host kit that can be decided from strings, so it is tested without
// Wrangler, Cloudflare or klef.sh.
//
// The kit is the built klef.sh server for one buyer's own Cloudflare account,
// downloaded from klef.sh with a licence key: worker/ (the bundled Worker),
// client/ (its static assets), migrations/ (D1) and kit.json (its version, the
// Wrangler it was built with, and the build's Worker settings). `klef kit`
// unpacks it into a temporary folder, deploys it, and deletes the folder, so
// no copy of the server is left lying around. This file is open source; the
// kit itself is not, and nothing here works without a licence.

import path from "node:path";

/** What `klef kit` remembers about one deployment. No licence key, no secrets. */
export interface KitState {
  workerName: string;
  /** Dodo's id for this deployment's activation of the licence. */
  instanceId: string;
  databaseId: string | null;
  /** The deployed URL, once known. */
  url: string | null;
  /** The kit version deployed, once deployed. */
  version: string | null;
  /** When this licence's updates end (klef.sh says, on each download). Absent in older state files. */
  updatesUntil?: string | null;
}

/** kit.json inside a kit bundle. */
export interface KitInfo {
  version: string;
  /** The Wrangler version the kit was built and tested with. */
  wrangler: string;
  built: BuiltConfig;
}

/** The Worker's settings, as read from the build's generated wrangler.json. */
export interface BuiltConfig {
  compatibility_date: string;
  compatibility_flags?: string[];
  rules?: unknown[];
  no_bundle?: boolean;
  assets?: { not_found_handling?: string; run_worker_first?: string[] | boolean };
  observability?: unknown;
}

/** Where kits come from. Not KLEF_API_URL: that may point at the self-hosted server itself. */
export function kitServer(env: NodeJS.ProcessEnv): string {
  return (env.KLEF_KIT_SERVER?.trim() || "https://klef.sh").replace(/\/+$/, "");
}

/** Where one deployment's state lives, under the CLI's config directory. */
export function kitStateFile(configDir: string, workerName: string): string {
  return path.join(configDir, "kit", `${workerName}.json`);
}

/**
 * The deployment a command means: the one named, or the only one there is.
 * A string is the reason there is no single answer.
 */
export function pickDeployment(names: string[], wanted: string | undefined): string | { error: string } {
  if (wanted) return names.includes(wanted) ? wanted : { error: `No kit deployment named ${wanted} on this machine.` };
  if (names.length === 1) return names[0]!;
  if (names.length === 0) return { error: "No kit deployment on this machine yet." };
  return { error: `More than one kit deployment here (${names.join(", ")}). Name the one you mean.` };
}

/**
 * The kit's wrangler.jsonc for one deployment. Built from the klef.sh build's
 * own config, so the Worker runs exactly as it does there, minus what is
 * klef.sh's alone: its domain, its database and its Dodo settings. Self-hosted
 * mode turns plans and limits off.
 */
export function kitWranglerConfig(
  built: BuiltConfig,
  opts: { name: string; databaseId: string | null; version?: string; updatesUntil?: string | null },
): object {
  return {
    name: opts.name,
    main: "worker/index.js",
    compatibility_date: built.compatibility_date,
    compatibility_flags: built.compatibility_flags ?? [],
    ...(built.rules ? { rules: built.rules } : {}),
    no_bundle: true,
    assets: {
      binding: "ASSETS",
      directory: "client",
      ...(built.assets?.not_found_handling ? { not_found_handling: built.assets.not_found_handling } : {}),
      ...(built.assets?.run_worker_first !== undefined ? { run_worker_first: built.assets.run_worker_first } : {}),
    },
    d1_databases: [
      {
        binding: "DB",
        database_name: `${opts.name}-db`,
        database_id: opts.databaseId ?? "REPLACED_BY_SETUP",
        migrations_dir: "migrations",
      },
    ],
    // The version and when updates end are for the server's Settings page,
    // which shows them; it learns them here rather than asking klef.sh.
    vars: {
      KLEF_SELF_HOSTED: "true",
      ...(opts.version ? { KLEF_KIT_VERSION: opts.version } : {}),
      ...(opts.updatesUntil ? { KLEF_KIT_UPDATES_UNTIL: opts.updatesUntil } : {}),
    },
    ...(built.observability ? { observability: built.observability } : {}),
  };
}

/** A Worker name Cloudflare accepts: lowercase letters, digits and dashes, 1 to 54 long. */
export function isWorkerName(name: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,52}[a-z0-9])?$/.test(name);
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

/** The new database's id from `wrangler d1 create` output (TOML or JSON), or null. */
export function parseDatabaseId(output: string): string | null {
  const m = /database_id"?\s*[:=]\s*"([0-9a-f-]{36})"/.exec(output);
  return m && UUID.test(m[1]!) ? m[1]! : null;
}

/** The workers.dev URL `wrangler deploy` prints, or null. */
export function parseDeployUrl(output: string): string | null {
  const m = /https:\/\/[a-z0-9.-]+\.workers\.dev\b/.exec(output);
  return m ? m[0] : null;
}

/** -1, 0 or 1, for plain x.y.z versions. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** A plausible licence key: what Dodo issues, never anything that could be a path or a command. */
export function isLicenseKeyShape(key: string): boolean {
  return /^[A-Za-z0-9_-]{8,128}$/.test(key);
}

/** A version string safe to put in a path or a command. */
export function isKitVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

/**
 * The secrets the Worker needs, each as the command that sets it. `klef kit`
 * never reads or holds a value: it prints these and the person runs them, so
 * a secret only ever passes between them and Wrangler.
 */
export function secretSteps(url: string, wranglerVersion: string, workerName: string): { command: string; hint: string }[] {
  const put = (name: string) => `npx wrangler@${wranglerVersion} secret put ${name} --name ${workerName}`;
  return [
    { command: put("BETTER_AUTH_SECRET"), hint: "a long random string, for example the output of: openssl rand -base64 32" },
    { command: put("BETTER_AUTH_URL"), hint: `the address people sign in at: ${url}` },
    { command: put("GOOGLE_CLIENT_ID"), hint: `from a Google OAuth client whose redirect URI is ${url}/api/auth/callback/google` },
    { command: put("GOOGLE_CLIENT_SECRET"), hint: "from the same Google OAuth client" },
    { command: put("GITHUB_CLIENT_ID"), hint: `from a GitHub OAuth app whose callback URL is ${url}/api/auth/callback/github` },
    { command: put("GITHUB_CLIENT_SECRET"), hint: "from the same GitHub OAuth app" },
  ];
}

const DAY = 24 * 60 * 60 * 1000;

/** How long before updates end the CLI starts saying so. */
export const RENEW_WARN_DAYS = 30;

/** Whether the once-a-day check for a newer kit is due, given when it last ran. */
export function updateCheckDue(lastChecked: string | null, now: number): boolean {
  const last = lastChecked ? Date.parse(lastChecked) : NaN;
  return Number.isNaN(last) || now - last >= DAY;
}

/** "1 November 2027", the same in every locale so tests and copy agree. */
function day(iso: string): string {
  const d = new Date(iso);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * What to tell the person about their kit deployments: a newer kit to
 * install, updates about to end, or updates ended with a newer kit out.
 * `run` builds a runnable command (invocation.ts). Empty when all is well.
 */
export function kitNotices(
  states: KitState[],
  latest: string | null,
  now: number,
  run: (sub: string) => string,
): string[] {
  const lines: string[] = [];
  for (const s of states) {
    if (!s.version) continue;
    const newer = latest !== null && compareVersions(latest, s.version) > 0;
    const until = s.updatesUntil ? Date.parse(s.updatesUntil) : NaN;
    const ended = !Number.isNaN(until) && until <= now;
    if (newer && !ended) {
      lines.push(`Klef kit ${latest} is out; ${s.workerName} runs ${s.version}. Update it with: ${run(`kit update ${s.workerName}`)}`);
    } else if (newer && ended) {
      lines.push(`Klef kit ${latest} is out, but ${s.workerName}'s updates ended on ${day(s.updatesUntil!)}. Renew at https://klef.sh/kit to get it; ${s.version} keeps running.`);
    }
    if (!ended && !Number.isNaN(until) && until - now <= RENEW_WARN_DAYS * DAY) {
      lines.push(`Updates for ${s.workerName} end on ${day(s.updatesUntil!)}. Renew at https://klef.sh/kit to keep getting them.`);
    }
  }
  return lines;
}

/**
 * A setup that activated a licence and stopped before it deployed anything,
 * for instance because the name it chose was taken or the deploy failed. It
 * can carry on under a new name, with its activation (and its database, if it
 * got that far) instead of spending another: the licence covers one
 * deployment, and this one never came to be. Null when there is none, or more
 * than one and so no telling which licence is meant.
 */
export function unfinishedSetup(states: KitState[], except: string): KitState | null {
  const found = states.filter((s) => s.workerName !== except && !s.url && !s.version);
  return found.length === 1 ? found[0]! : null;
}

/** Database names from `wrangler d1 list --json`; empty when the output isn't that. */
export function parseDatabaseNames(output: string): string[] {
  try {
    const rows = JSON.parse(output) as unknown;
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => (r as { name?: unknown })?.name).filter((n): n is string => typeof n === "string");
  } catch {
    return [];
  }
}
