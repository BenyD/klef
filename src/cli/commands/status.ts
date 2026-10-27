// SPDX-License-Identifier: AGPL-3.0-or-later

import { command } from "../invocation.ts";
import { KlefApi, UnauthorizedError } from "../api.ts";
import { loadToken } from "../credentials.ts";
import { apiBaseUrl } from "../paths.ts";
import { readProjectConfig } from "../project-file.ts";
import type { ParsedArgs } from "../args.ts";
import { stat } from "node:fs/promises";
import { allFiles, CONFIG_FILENAME, type ProjectConfig } from "../project-config.ts";
import { findFile } from "../resolve.ts";
import { loadSyncState } from "../sync-state.ts";
import { quickState, QUICK_STATE_WORDS, type QuickState } from "../sync-plan.ts";
import { resolveWritePath } from "../write-path.ts";
import { CLI_VERSION } from "../version.ts";
import type { VaultTree } from "../../shared/api-types.ts";
import { cmd, emit, say, style, uiMode, type NextStep } from "../ui.ts";
import { loadRememberedKey, type KeySource } from "../key-store.ts";
import { homedir } from "node:os";
import { agentSocketPath } from "../paths.ts";
import { agentStatus } from "../agent-client.ts";
import { describeTimeLeft, type AgentStatus } from "../agent-protocol.ts";

const SOURCE_LABEL = {
  keychain: "OS keychain",
  file: "config file",
  environment: "KLEF_TOKEN",
} as const;

/** Why we are or aren't signed in, kept separate from how it is phrased. */
type TokenStatus = "valid" | "rejected" | "unverified" | "absent";

/**
 * Everything an agent needs before it does anything else, in one call and
 * without the passphrase: who is signed in, what this directory is linked
 * to, whether the vault is unlocked, each linked file's sync state as far as
 * it can be told without decrypting, and the commands that would move things
 * on. Always exits 0: the answer is the report, whatever it says.
 */
export async function status(
  _args: ParsedArgs,
  env: NodeJS.ProcessEnv,
  cwd: string,
): Promise<number> {
  const base = apiBaseUrl(env);
  const stored = await loadToken(env);

  let tokenStatus: TokenStatus = stored ? "unverified" : "absent";
  let email: string | null = null;
  let tree: VaultTree | null = null;
  let remembered: KeySource | null = null;
  const config = await readProjectConfig(cwd);

  if (stored) {
    const api = new KlefApi(base, stored.token);
    try {
      email = (await api.whoami()).user.email;
      tokenStatus = "valid";
      if (config) tree = await api.tree();
      const vault = await api.vault();
      if (vault.exists && vault.keyMaterial) remembered = (await loadRememberedKey(env, vault.keyMaterial))?.source ?? null;
    } catch (err) {
      tokenStatus = err instanceof UnauthorizedError ? "rejected" : tokenStatus === "valid" ? "valid" : "unverified";
    }
  }

  // Locked or not is a question for the local agent alone; it needs neither
  // the network nor the passphrase. A socket directory that fails its safety
  // check is reported rather than thrown, so status still says everything else.
  let agent: AgentStatus | null = null;
  let agentProblem: string | null = null;
  try {
    agent = await agentStatus(agentSocketPath(env, homedir()));
  } catch (err) {
    agentProblem = err instanceof Error ? err.message : String(err);
  }

  const files = config ? await fileStates(config, tree, cwd, env) : [];
  const unlockedBy = remembered ? "remembered" : agent ? "agent" : null;
  const next = nextSteps({ tokenStatus, linked: config !== null, unlocked: unlockedBy !== null, files, treeKnown: tree !== null });

  emit({
    version: CLI_VERSION,
    server: base,
    account: { signedIn: tokenStatus === "valid", email, tokenSource: stored?.source ?? null, tokenStatus },
    vault: {
      unlocked: unlockedBy !== null,
      unlockedBy,
      keyStore: remembered,
      locksInSeconds: !remembered && agent ? Math.floor(agent.msLeft / 1000) : null,
      problem: agentProblem,
    },
    project: config
      ? { workspace: config.workspace, project: config.project, config: CONFIG_FILENAME }
      : null,
    files,
    next: next.map((n) => ({ command: n.command, description: n.description })),
  });
  if (uiMode().json) return 0;

  const rows: [string, string][] = [];
  if (!stored) rows.push(["Account", style.yellow("not signed in")]);
  else if (tokenStatus === "valid") rows.push(["Account", `${email} ${style.dim(`(token in ${SOURCE_LABEL[stored.source]})`)}`]);
  else rows.push(["Account", style.yellow(`token ${tokenStatus} ${style.dim(`(from ${SOURCE_LABEL[stored.source]})`)}`)]);
  rows.push(["Server", base]);
  rows.push(["Project", config ? `${config.workspace} / ${config.project} ${style.dim(`(${CONFIG_FILENAME})`)}` : style.yellow(`not linked ${style.dim(`(no ${CONFIG_FILENAME} here)`)}`)]);
  files.forEach((f, i) => {
    const width = Math.max(...files.map((x) => x.path.length));
    const words = QUICK_STATE_WORDS[f.state];
    const styled = f.state === "in-sync" ? style.dim(words) : f.state === "both-changed" ? style.red(words) : style.yellow(words);
    rows.push([i === 0 ? "Files" : "", `${f.path.padEnd(width)}  ${tree || f.state !== "unknown" ? styled : style.dim("unknown (could not reach the vault)")}`]);
  });
  if (remembered) {
    const where = remembered === "keychain" ? "key in your OS keychain" : "key in a private file";
    rows.push(["Vault", `${style.green("unlocked on this device")} ${style.dim(`(${where}; ${command("lock")} forgets it)`)}`]);
  } else if (agent) rows.push(["Vault", `${style.green("unlocked")} ${style.dim(`(locks in ${describeTimeLeft(agent.msLeft)} without use)`)}`]);
  else rows.push(["Vault", `locked ${style.dim(agentProblem ? `(${agentProblem})` : "(pull, push and sync ask for the passphrase)")}`]);

  for (const [label, value] of rows) say(`${label.padEnd(8)}  ${value}`);
  if (next.length) {
    const width = Math.max(...next.map((n) => n.command.length));
    say();
    say("Next");
    for (const n of next) say(`  ${cmd(n.command.padEnd(width))}  ${style.dim(n.description ?? "")}`.trimEnd());
  }
  return 0;
}

interface FileState {
  file: string;
  path: string;
  local: boolean;
  inVault: boolean;
  state: QuickState;
}

async function fileStates(
  config: ProjectConfig,
  tree: VaultTree | null,
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<FileState[]> {
  const state = await loadSyncState(env);
  const out: FileState[] = [];
  for (const entry of allFiles(config)) {
    let destination: string;
    try {
      destination = resolveWritePath(cwd, entry.path);
    } catch {
      continue; // An unsafe path is reported by the commands that would use it.
    }
    const info = await stat(destination).catch(() => null);
    const local = info ? { mtimeMs: info.mtimeMs, size: info.size } : null;
    let found = null;
    try {
      found = tree ? findFile(tree, { ...config, file: entry.file }) : null;
    } catch {
      found = null; // The project itself is gone; every file reads as not in the vault.
    }
    const quick = tree
      ? quickState({ local, vaultVersionId: found?.currentVersionId ?? null, baseline: state[destination] ?? null })
      : "unknown";
    out.push({ file: entry.file, path: entry.path, local: local !== null, inVault: Boolean(found?.currentVersionId), state: quick });
  }
  return out;
}

/** What to run next, most useful first. Never more than three. */
function nextSteps(s: {
  tokenStatus: TokenStatus;
  linked: boolean;
  unlocked: boolean;
  files: FileState[];
  treeKnown: boolean;
}): NextStep[] {
  if (s.tokenStatus === "absent" || s.tokenStatus === "rejected") {
    return [{ command: command(s.linked ? "login" : "setup"), description: s.linked ? "sign in" : "sign in and link this repo" }];
  }
  if (!s.linked) return [{ command: command("setup"), description: "link this repo and pull its files" }];
  if (!s.treeKnown) return [];
  const moving = s.files.filter((f) => f.state !== "in-sync" && f.state !== "absent");
  if (moving.length === 0) return [];
  const steps: NextStep[] = [];
  if (!s.unlocked) {
    steps.push({ command: command("login"), description: "the user approves in the browser, which unlocks this device" });
  }
  if (moving.some((f) => f.state === "unknown")) steps.push({ command: command("diff --all"), description: "see which keys differ" });
  steps.push({ command: command("sync"), description: "bring the files in line" });
  return steps.slice(0, 3);
}
