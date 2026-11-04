// SPDX-License-Identifier: MIT
//
// `klef kit setup | update | status [name]`: deploys and updates the Klef
// self-host kit on the person's own Cloudflare account.
//
// Each run downloads the kit from klef.sh into a temporary folder, deploys it
// with Wrangler and deletes the folder, whatever happened. What stays on this
// machine is a small state file per deployment (kit-lib.ts, KitState): its
// Worker and database names and its licence activation, never the licence key
// or a secret. Secrets go from the person to Wrangler directly: setup prints
// the commands and they run them.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { flagValue, hasFlag, type ParsedArgs } from "../args.ts";
import { openBrowser } from "../device-login.ts";
import { generateSealKeypair, openToken, type SealedToken } from "../../shared/device-seal.ts";
import { configDir } from "../paths.ts";
import { childEnv } from "../run-tool.ts";
import { promptLine, promptSecret } from "../prompt.ts";
import { command as suggested } from "../invocation.ts";
import { CliError, cmd, done, emit, note, say, uiMode } from "../ui.ts";
import {
  compareVersions,
  isKitVersion,
  isLicenseKeyShape,
  isWorkerName,
  KEY_PORTAL,
  kitServer,
  kitStateFile,
  kitNotices,
  kitWranglerConfig,
  parseDatabaseId,
  parseDatabaseNames,
  parseDeployUrl,
  pickDeployment,
  secretSteps,
  unfinishedSetup,
  updateCheckDue,
  type KitInfo,
  type KitState,
} from "../kit-lib.ts";

interface Ctx {
  server: string;
  dir: string;
  /**
   * Whether a person can answer prompts here. Not under a coding agent, CI
   * or --no-input: then the licence key comes through the browser and
   * nothing waits on Enter.
   */
  interactive: boolean;
  /** Take the licence key through the browser even at a terminal. */
  browser: boolean;
  /** The Worker's name, from --name; asked for when not given. */
  name: string | null;
}

export async function kit(args: ParsedArgs, env: NodeJS.ProcessEnv): Promise<number> {
  const mode = uiMode();
  const ctx: Ctx = {
    server: kitServer(env),
    dir: configDir(env, homedir()),
    interactive: mode.input && !mode.agent && !mode.json,
    browser: hasFlag(args, "browser"),
    name: flagValue(args, "name"),
  };
  const [sub, name] = args.positionals;
  if (sub === "setup") return setup(ctx);
  if (sub === "update") return update(ctx, name);
  if (sub === "status") return status(ctx);
  throw new CliError("usage", sub ? `Unknown kit command "${sub}".` : "Say what to do: setup, update or status.", {
    next: [suggested("kit setup")],
  });
}

// ---------------------------------------------------------------- state

function readState(ctx: Ctx, workerName: string): KitState | null {
  const file = kitStateFile(ctx.dir, workerName);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as KitState) : null;
}

function writeState(ctx: Ctx, state: KitState): void {
  const file = kitStateFile(ctx.dir, state.workerName);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function unfinished(ctx: Ctx, except: string): KitState | null {
  const states = deployments(ctx)
    .map((name) => readState(ctx, name))
    .filter((s): s is KitState => !!s);
  return unfinishedSetup(states, except);
}

function deployments(ctx: Ctx): string[] {
  const dir = path.dirname(kitStateFile(ctx.dir, "x"));
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length));
}

// ---------------------------------------------------------------- klef.sh

async function call(ctx: Ctx, route: string, body?: unknown): Promise<Response> {
  try {
    return await fetch(`${ctx.server}/api/kit/${route}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      // Generous: a download carries the whole kit.
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new CliError("network", `Could not reach ${ctx.server}.`, { hint: "Check your connection and run the same command again." });
  }
}

async function failure(res: Response, fallback: string): Promise<CliError> {
  const error = ((await res.json().catch(() => ({}))) as { error?: unknown }).error;
  const message = typeof error === "string" ? error : `${fallback} (${res.status}).`;
  if (res.status === 403 || res.status === 409) return new CliError("conflict", message);
  if (res.status === 400) return new CliError("usage", message);
  return new CliError("server", message);
}

async function latestVersion(ctx: Ctx): Promise<string> {
  const res = await call(ctx, "latest");
  if (!res.ok) throw await failure(res, "Could not find the newest kit");
  const version = ((await res.json()) as { version?: unknown }).version;
  if (typeof version !== "string" || !isKitVersion(version)) throw new CliError("server", "klef.sh named a kit version this CLI does not understand.");
  return version;
}

async function activate(ctx: Ctx, licenseKey: string, workerName: string): Promise<string> {
  const res = await call(ctx, "activate", { licenseKey, name: workerName });
  if (!res.ok) throw await failure(res, "Could not activate the licence");
  return ((await res.json()) as { instanceId: string }).instanceId;
}

/** Downloads and unpacks the newest kit into a new temporary folder. The caller removes `root`. */
async function fetchKit(
  ctx: Ctx,
  licenseKey: string,
  instanceId: string,
): Promise<{ root: string; kitDir: string; info: KitInfo; updatesUntil: string | null }> {
  const res = await call(ctx, "download", { licenseKey, instanceId });
  if (!res.ok) throw await failure(res, "The download failed");
  const version = res.headers.get("x-kit-version") ?? "";
  const until = res.headers.get("x-kit-updates-until");
  const updatesUntil = until && !Number.isNaN(Date.parse(until)) ? new Date(until).toISOString() : null;
  if (!isKitVersion(version)) throw new CliError("server", "klef.sh sent a kit without a version this CLI understands.");

  const root = mkdtempSync(path.join(tmpdir(), "klef-kit-"));
  try {
    const archive = path.join(root, "kit.tar.gz");
    writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
    const unpacked = spawnSync("tar", ["-xzf", archive, "-C", root], { stdio: "inherit" });
    rmSync(archive, { force: true });
    if (unpacked.status !== 0) throw new CliError("internal", "Could not unpack the kit. Is tar installed?");
    const kitDir = path.join(root, `klef-kit-${version}`);
    const info = JSON.parse(readFileSync(path.join(kitDir, "kit.json"), "utf8")) as KitInfo;
    return { root, kitDir, info, updatesUntil };
  } catch (err) {
    rmSync(root, { recursive: true, force: true });
    throw err;
  }
}

// ---------------------------------------------------------------- Wrangler

/**
 * Runs the kit's own Wrangler version in the unpacked kit. `capture` also
 * returns stdout, still shown. `unattended` answers Wrangler's own yes/no
 * questions (CI=1), for steps where setup has already decided the answer.
 */
function wrangler(
  kitDir: string,
  version: string,
  wranglerArgs: string[],
  opts: { capture?: boolean; unattended?: boolean; quiet?: boolean } = {},
): { ok: boolean; out: string } {
  const capture = opts.capture ?? false;
  // Under --json, stdout carries the one JSON object, so Wrangler's own
  // output goes to stderr instead.
  const out = uiMode().json ? process.stderr : process.stdout;
  const res = spawnSync("npx", ["--yes", `wrangler@${version}`, ...wranglerArgs], {
    cwd: kitDir,
    env: opts.unattended ? { ...childEnv(process.env), CI: "1" } : childEnv(process.env),
    encoding: "utf8",
    stdio: ["inherit", capture ? "pipe" : uiMode().json ? 2 : "inherit", "inherit"],
    shell: process.platform === "win32",
  });
  if (capture && res.stdout && !opts.quiet) out.write(res.stdout);
  return { ok: res.status === 0, out: res.stdout ?? "" };
}

function stepFailed(what: string, rerun: string): CliError {
  return new CliError("server", `${what} Fix the error above and run the same command again.`, { next: [suggested(rerun)] });
}

/** Signs Wrangler in if needed, writes the config, migrates and deploys. Returns the URL, if Wrangler printed one. */
/** The D1 databases in the signed-in account, by name; empty when Wrangler can't list them. */
function databaseNames(w: (a: string[], opts?: { capture?: boolean; quiet?: boolean }) => { ok: boolean; out: string }): string[] {
  const listed = w(["d1", "list", "--json"], { capture: true, quiet: true });
  return listed.ok ? parseDatabaseNames(listed.out) : [];
}

function deployKit(kitDir: string, info: KitInfo, state: KitState, rerun: string, onDatabase: (id: string) => void): string | null {
  const w = (a: string[], opts: { capture?: boolean; unattended?: boolean; quiet?: boolean } = {}) => wrangler(kitDir, info.wrangler, a, opts);
  const who = w(["whoami"], { capture: true });
  if (!who.ok || /not authenticated/i.test(who.out)) {
    note("Signing Wrangler in to your Cloudflare account...");
    if (!w(["login"]).ok) throw stepFailed("Wrangler could not sign in.", rerun);
  }

  if (!state.databaseId) {
    // Wrangler would only say "already exists"; say which name, and that a
    // rerun with another name keeps this machine's activation.
    const database = `${state.workerName}-db`;
    if (databaseNames(w).includes(database)) {
      throw new CliError("conflict", `This Cloudflare account already has a database named ${database}.`, {
        hint: "Run setup again and choose another name for your Worker. Your licence carries over to it.",
        next: [suggested(rerun)],
      });
    }
    note("\nCreating the database...");
    const created = w(["d1", "create", `${state.workerName}-db`], { capture: true, unattended: true });
    const id = parseDatabaseId(created.out);
    if (!created.ok || !id) throw stepFailed("Could not create the database.", rerun);
    state.databaseId = id;
    onDatabase(id);
  }

  const config = kitWranglerConfig(info.built, {
    name: state.workerName,
    databaseId: state.databaseId,
    version: info.version,
    updatesUntil: state.updatesUntil ?? null,
  });
  writeFileSync(path.join(kitDir, "wrangler.jsonc"), `${JSON.stringify(config, null, 2)}\n`);

  // Unattended: Wrangler would ask whether to go ahead, and setup or update
  // running at all is the answer.
  note("\nApplying the database schema...");
  if (!w(["d1", "migrations", "apply", "DB", "--remote"], { unattended: true }).ok) throw stepFailed("The migrations failed.", rerun);

  note("\nDeploying...");
  const deployed = w(["deploy"], { capture: true, unattended: true });
  if (!deployed.ok) throw stepFailed("The deploy failed.", rerun);
  return parseDeployUrl(deployed.out);
}

/**
 * Whether the deployment answers its health check. A Worker's first deploy to
 * a new workers.dev address takes a few seconds to resolve, so this keeps
 * asking for up to a minute before saying no.
 */
async function healthy(url: string, attempts = 12, intervalMs = 5000): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(10_000) });
      if (res.ok && ((await res.json()) as { ok?: boolean }).ok === true) return true;
    } catch {
      // Not resolving yet.
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * Runs `fn` with the unpacked kit's folder, and deletes the folder afterwards
 * however it ends: success, a failed step, or Ctrl-C.
 */
async function withKitFolder<T>(root: string, fn: () => Promise<T> | T): Promise<T> {
  const remove = () => rmSync(root, { recursive: true, force: true });
  const onSignal = (signal: NodeJS.Signals) => {
    remove();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    return await fn();
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    remove();
  }
}

/**
 * The licence key: typed at the terminal, or, where nobody can type (a coding
 * agent's shell, CI) or with --browser, pasted on klef.sh in the browser and
 * handed back sealed to this process (connectLicenseKey). Never printed
 * either way, so an agent driving this never sees it.
 */
async function getLicenseKey(ctx: Ctx): Promise<string> {
  return ctx.interactive && !ctx.browser ? askLicenseKey() : connectLicenseKey(ctx);
}

async function connectLicenseKey(ctx: Ctx): Promise<string> {
  const { publicJwk, privateKey } = await generateSealKeypair();
  const started = await call(ctx, "connect", { publicJwk });
  if (!started.ok) throw await failure(started, "Could not start the browser handoff");
  const { deviceCode, userCode, verificationUri, interval, expiresIn } = (await started.json()) as {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    interval: number;
    expiresIn: number;
  };
  say(`Paste your licence key in the browser: ${verificationUri}`);
  say(`Check the code there matches ${userCode}. Waiting for it...`);
  openBrowser(verificationUri);

  const deadline = Date.now() + expiresIn * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval * 1000));
    // A dropped poll is retried on the next tick; the code lasts minutes.
    const res = await call(ctx, "connect/token", { deviceCode }).catch(() => null);
    if (!res || res.status === 428 || res.status === 429 || res.status >= 500) continue;
    if (!res.ok) break;
    const { sealedKey } = (await res.json()) as { sealedKey: SealedToken };
    const key = (await openToken(privateKey, sealedKey).catch(() => "")).trim();
    if (!isLicenseKeyShape(key)) throw new CliError("usage", "What came back from the browser is not a licence key. Run the same command again.");
    note("Got the licence key from the browser.");
    return key;
  }
  throw new CliError("timed_out", "The licence key was not pasted in the browser in time.", {
    hint: `Run the same command again for a new code. No key? ${KEY_PORTAL} has it, signed in with the email you paid with.`,
  });
}

async function askLicenseKey(): Promise<string> {
  const key = (await promptSecret("Licence key (from your receipt, not shown): ")).trim();
  if (!isLicenseKeyShape(key)) {
    throw new CliError("usage", "That does not look like a licence key. Copy it from your receipt email.", {
      hint: `No receipt? Sign in to ${KEY_PORTAL} with the email you paid with, or write to hello@klef.sh.`,
    });
  }
  return key;
}

// ---------------------------------------------------------------- commands

async function setup(ctx: Ctx): Promise<number> {
  say("Klef self-host kit: deploys Klef to your own Cloudflare account.\n");
  const licenseKey = await getLicenseKey(ctx);
  const workerName = ctx.name?.trim() || (ctx.interactive ? (await promptLine("Name for your Worker (klef): ")).trim() : "") || "klef";
  if (!isWorkerName(workerName)) throw new CliError("usage", "Use lowercase letters, digits and dashes for the Worker name.");
  const rerun = "kit setup";

  // A second run picks up where the first stopped, on the same activation:
  // under the same name, or under a new one when the first never got as far
  // as creating anything.
  const abandoned = readState(ctx, workerName) ? null : unfinished(ctx, workerName);
  if (abandoned) {
    note(`Carrying on the setup of ${abandoned.workerName}, which stopped before it deployed, as ${workerName}.`);
    rmSync(kitStateFile(ctx.dir, abandoned.workerName), { force: true });
  }
  const state: KitState = readState(ctx, workerName) ??
    (abandoned
      ? { ...abandoned, workerName }
      : { workerName, instanceId: await activate(ctx, licenseKey, workerName), databaseId: null, url: null, version: null });
  writeState(ctx, state);

  note("\nDownloading the kit...");
  const { root, kitDir, info, updatesUntil } = await fetchKit(ctx, licenseKey, state.instanceId);
  state.updatesUntil = updatesUntil ?? state.updatesUntil ?? null;
  await withKitFolder(root, () => {
    const url = deployKit(kitDir, info, state, rerun, () => writeState(ctx, state));
    state.url = url ?? state.url;
    state.version = info.version;
    writeState(ctx, state);
  });
  if (!state.url && ctx.interactive) {
    state.url = (await promptLine("The address Wrangler deployed to (https://...): ")).trim().replace(/\/+$/, "") || null;
    writeState(ctx, state);
  }
  const url = state.url ?? "https://<your worker>.workers.dev";

  say("\nNow set the secrets. Run each command in another terminal and paste the value when Wrangler asks.");
  say("Nothing here reads them: they go straight from you to Cloudflare.\n");
  for (const step of secretSteps(url, info.wrangler, workerName)) {
    say(`  ${cmd(step.command)}`);
    say(`    ${step.hint}\n`);
  }
  if (!ctx.interactive) {
    // Nobody here to press Enter: the deploy is done, and the secrets are the
    // person's to set. `kit status` checks the deployment once they are.
    done(`Klef ${info.version} is deployed${state.url ? ` at ${state.url}` : ""}. Set the six secrets above, then check it with ${cmd(suggested("kit status"))}.`);
    emit({ workerName, url: state.url, version: info.version, secretsSet: false });
    return 0;
  }
  await promptLine("Press Enter once all six are set. ");
  note("Checking the deployment...");

  if (!state.url || !(await healthy(state.url))) {
    throw new CliError("server", `${url}/api/health did not answer ok.`, {
      hint: "Check the six secrets are set, then check again.",
      next: [suggested("kit status")],
    });
  }
  done(`Klef ${info.version} is running at ${state.url}. Sign in there to create your account.`);
  note(`Point the CLI at it with: ${cmd(`KLEF_API_URL=${state.url}`, true)}`);
  emit({ workerName, url: state.url, version: info.version });
  return 0;
}

async function update(ctx: Ctx, wanted: string | undefined): Promise<number> {
  const picked = pickDeployment(deployments(ctx), wanted);
  if (typeof picked !== "string") throw new CliError("not_found", picked.error, { next: [suggested("kit status")] });
  const state = readState(ctx, picked)!;

  const latest = await latestVersion(ctx);
  if (state.version && compareVersions(latest, state.version) <= 0) {
    done(`${state.workerName} is up to date: kit ${state.version}.`);
    emit({ workerName: state.workerName, version: state.version, updated: false });
    return 0;
  }

  say(`Updating ${state.workerName} from ${state.version ?? "an unfinished setup"} to ${latest}.`);
  const licenseKey = await getLicenseKey(ctx);
  note("\nDownloading the kit...");
  const { root, kitDir, info, updatesUntil } = await fetchKit(ctx, licenseKey, state.instanceId);
  state.updatesUntil = updatesUntil ?? state.updatesUntil ?? null;
  await withKitFolder(root, () => {
    state.url = deployKit(kitDir, info, state, `kit update ${state.workerName}`, () => writeState(ctx, state)) ?? state.url;
    state.version = info.version;
    writeState(ctx, state);
  });
  if (state.url && !(await healthy(state.url))) {
    throw new CliError("server", `${state.url}/api/health did not answer ok after the update.`);
  }
  done(`Updated ${state.workerName} to kit ${info.version}.`);
  emit({ workerName: state.workerName, version: info.version, updated: true });
  return 0;
}

async function status(ctx: Ctx): Promise<number> {
  const names = deployments(ctx);
  const states = names.map((n) => readState(ctx, n)!);
  if (!states.length) say(`No kit deployment on this machine. Set one up with ${cmd(suggested("kit setup"))}.`);
  // One quick health check each: after a setup that ended at the deploy
  // (no terminal to wait at), this is where you see the secrets took.
  const up = await Promise.all(states.map((s) => (s.url ? healthy(s.url, 1, 0) : Promise.resolve(false))));
  for (const [i, s] of states.entries()) {
    const until = s.updatesUntil ? `, updates until ${s.updatesUntil.slice(0, 10)}` : "";
    const health = s.url ? (up[i] ? ", answering" : ", not answering yet (are its six secrets set?)") : "";
    say(`${s.workerName}: kit ${s.version ?? "(setup not finished)"}${s.url ? ` at ${s.url}` : ""}${health}${until}`);
  }
  if (states.length) {
    const latest = await latestVersion(ctx).catch(() => null);
    for (const line of kitNotices(states, latest, Date.now(), suggested)) note(line);
  }
  emit({
    deployments: states.map(({ workerName, url, version, updatesUntil }, i) => ({ workerName, url, version, updatesUntil: updatesUntil ?? null, healthy: up[i] })),
  });
  return 0;
}

// ---------------------------------------------------------------- the daily notice

/**
 * After any klef command on a machine that set up a kit: once a day, ask
 * klef.sh for the newest kit version and say so when a deployment is behind,
 * or its updates are about to end. Never under --json, --quiet, an agent or
 * without a terminal, never slower than a second and a half, and silent on
 * any failure: it is a notice, not part of the command.
 */
export async function kitUpdateNotice(env: NodeJS.ProcessEnv): Promise<void> {
  const mode = uiMode();
  if (mode.json || mode.quiet || mode.agent || !mode.input || process.stderr.isTTY !== true) return;
  const ctx: Ctx = { server: kitServer(env), dir: configDir(env, homedir()), interactive: false, browser: false, name: null };
  const names = deployments(ctx);
  if (!names.length) return;
  const stamp = path.join(path.dirname(kitStateFile(ctx.dir, "x")), ".last-check");
  const last = existsSync(stamp) ? readFileSync(stamp, "utf8").trim() : null;
  if (!updateCheckDue(last, Date.now())) return;
  try {
    const res = await fetch(`${ctx.server}/api/kit/latest`, { signal: AbortSignal.timeout(1500) });
    writeFileSync(stamp, `${new Date().toISOString()}\n`, { mode: 0o600 });
    const version = res.ok ? ((await res.json()) as { version?: unknown }).version : null;
    const latest = typeof version === "string" && isKitVersion(version) ? version : null;
    const lines = kitNotices(names.map((n) => readState(ctx, n)!), latest, Date.now(), suggested);
    if (lines.length) note(`\n${lines.join("\n")}`);
  } catch {
    // Offline, slow or anything else: say nothing.
  }
}
