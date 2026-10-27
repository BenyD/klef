// SPDX-License-Identifier: AGPL-3.0-or-later

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { command, invocationName } from "../invocation.ts";
import { CLI_VERSION } from "../version.ts";
import {
  DEFAULT_TARGETS,
  GLOBAL_TARGETS,
  isSetupTarget,
  planSetup,
  SETUP_TARGETS,
  targetPath,
  type PlannedWrite,
  type SetupTarget,
} from "../agent-setup.ts";
import {
  configForChoice,
  describeChoice,
  findChoice,
  projectChoices,
  type ProjectChoice,
} from "../setup-link.ts";
import { KlefApi, UnauthorizedError } from "../api.ts";
import { loadToken } from "../credentials.ts";
import { apiBaseUrl } from "../paths.ts";
import { readProjectConfig, writeProjectConfig } from "../project-file.ts";
import { allFiles, CONFIG_FILENAME, type ProjectConfig } from "../project-config.ts";
import { resolveWritePath } from "../write-path.ts";
import { confirm, NoTerminalError, promptLine } from "../prompt.ts";
import { flagValue, hasFlag, parseArgs, type ParsedArgs } from "../args.ts";
import { confirmOrFail } from "../common.ts";
import { CliError, cmd, done, emit, nested, note, say, style, uiMode, type NextStep } from "../ui.ts";
import { fileStates, type FileState } from "../file-states.ts";
import { QUICK_STATE_WORDS } from "../sync-plan.ts";
import type { VaultTree } from "../../shared/api-types.ts";
import { login } from "./login.ts";
import { unlock } from "./unlock.ts";
import { pull } from "./pull.ts";
import { homedir } from "node:os";

/** Everything setup reaches outside itself for, so tests can stand it in. */
export interface SetupDeps {
  home: string;
  /** Yes/no at the terminal; throws NoTerminalError without one. */
  ask: (question: string) => Promise<boolean>;
  /** A line at the terminal; throws NoTerminalError without one. */
  line: (question: string) => Promise<string>;
  /** The signed-in account's email and vault tree, or null if not signed in. */
  account: () => Promise<{ email: string; tree: VaultTree } | null>;
  login: () => Promise<number>;
  unlock: () => Promise<number>;
  /** Each linked file's state, as `status` reports it; optional so tests can leave it out. */
  states?: (config: ProjectConfig) => Promise<FileState[]>;
  /** Pull one vault file to one local path. */
  pullFile: (file: string, localPath: string) => Promise<number>;
}

export function defaultSetupDeps(args: ParsedArgs, env: NodeJS.ProcessEnv, cwd: string): SetupDeps {
  return {
    home: homedir(),
    ask: confirm,
    line: promptLine,
    async account() {
      const stored = await loadToken(env);
      if (!stored) return null;
      const api = new KlefApi(apiBaseUrl(env), stored.token);
      try {
        const { user } = await api.whoami();
        return { email: user.email, tree: await api.tree() };
      } catch (err) {
        if (err instanceof UnauthorizedError) return null;
        throw err;
      }
    },
    login: () => nested(() => login(parseArgs(["login", ...(hasFlag(args, "paste") ? ["--paste"] : [])]), env)),
    unlock: () => nested(() => unlock(parseArgs(["unlock"]), env)),
    async states(config) {
      const stored = await loadToken(env);
      const tree = stored ? await new KlefApi(apiBaseUrl(env), stored.token).tree().catch(() => null) : null;
      return fileStates(config, tree, cwd, env);
    },
    pullFile: (file, localPath) =>
      nested(() => pull(parseArgs(["pull", "--file", file, "--path", localPath]), env, cwd)),
  };
}

/**
 * One command from nothing to a working repo: sign in, link this directory to
 * a project, teach Claude Code and Cursor how to use Klef, then unlock and
 * pull whatever is not on disk yet. Each step is skipped when it is already
 * done, so running it again is safe and is how the agent files get refreshed.
 *
 * Naming targets (`klef setup claude cursor`) or passing `--global` does only
 * the agent-files step.
 *
 * The same command works for a person and for an agent. Wherever a step
 * needs a human (approving the sign-in, choosing a project, the passphrase),
 * a person is asked at the terminal; an agent is told exactly what to hand
 * the user or which flags to rerun with once the user has answered in chat.
 */
export async function setup(
  args: ParsedArgs,
  cwd: string,
  deps: SetupDeps,
): Promise<number> {
  if (args.positionals.length > 0 || hasFlag(args, "global")) {
    return installAgentFiles(args, cwd, deps);
  }

  const step = (n: number, text: string) => say(`${style.dim(`${n}/4`)}  ${text}`);
  const report: Record<string, unknown> = { signedIn: false, email: null, linked: null, agentFiles: [], pulled: [] };

  // 1. Signed in.
  let account = await deps.account();
  if (!account) {
    step(1, "Sign in");
    const code = await deps.login();
    if (code !== 0) return code;
    account = await deps.account();
    if (!account) {
      throw new CliError("not_signed_in", "Still not signed in.", { next: [command("login"), command("setup")] });
    }
  } else {
    step(1, `Signed in as ${account.email}`);
  }
  report.signedIn = true;
  report.email = account.email;

  // 2. Linked.
  let config = await readProjectConfig(cwd);
  if (config) {
    step(2, `Linked to ${config.workspace} / ${config.project}`);
  } else {
    const choice = await chooseProject(args, projectChoices(account.tree), deps);
    config = { ...configForChoice(choice), minVersion: CLI_VERSION };
    await writeProjectConfig(cwd, config);
    step(2, `Linked to ${config.workspace} / ${config.project} (${allFiles(config).length} files)`);
    say(style.dim(`     Wrote ${CONFIG_FILENAME}: names only, safe to commit.`));
  }
  report.linked = { workspace: config.workspace, project: config.project, files: allFiles(config) };

  // 3. Agents taught.
  step(3, "Instructions for Claude Code and Cursor");
  const agentCode = await installAgentFiles(args, cwd, deps, report);

  // 4. Files on disk. Only the missing ones: pull overwrites, and a local
  // file may hold edits that are not in the vault yet.
  const missing: { file: string; path: string }[] = [];
  for (const entry of allFiles(config)) {
    if (!(await exists(resolveWritePath(cwd, entry.path)))) missing.push(entry);
  }
  if (missing.length === 0) {
    step(4, "Every file is on disk");
    await finish(config, deps, report);
    return agentCode;
  }

  step(4, `Pull ${missing.map((m) => m.path).join(", ")}`);
  let unlocked: number;
  try {
    unlocked = await deps.unlock();
  } catch (err) {
    if (!(err instanceof NoTerminalError || (err instanceof CliError && err.code === "no_terminal"))) throw err;
    throw new CliError("locked", "Pulling needs the vault unlocked on this device, and that needs the user.", {
      hint: "Have the user approve a sign-in in the browser (it unlocks this device), or run klef unlock themselves, then pull:",
      next: [{ command: command("login"), description: "the user approves in the browser, which unlocks this device" }, { command: command("unlock"), description: "or the user types the passphrase in their own terminal" }, { command: command("pull --all") }],
      data: report,
    });
  }
  // Without the unlock agent (Windows) each pull asks on its own; still fine.
  if (unlocked !== 0 && process.platform !== "win32") return unlocked;

  for (const { file, path: localPath } of missing) {
    const code = await deps.pullFile(file, localPath);
    if (code !== 0) return code;
    (report.pulled as string[]).push(localPath);
  }
  await finish(config, deps, report);
  done("Done. New Claude Code and Cursor sessions in this repo already know how to use Klef");
  return agentCode;
}

/** How setup sees a file's state: "unknown" here means it has not been compared yet. */
const SETUP_WORDS: Record<FileState["state"], string> = {
  ...QUICK_STATE_WORDS,
  unknown: "on disk, not yet compared",
};

/**
 * End where `status` would: each file's state and what to run next, rather
 * than "already here", which said nothing about whether here matches the
 * vault. Never needs the passphrase.
 */
async function finish(config: ProjectConfig, deps: SetupDeps, report: Record<string, unknown>): Promise<void> {
  const files = deps.states ? await deps.states(config) : [];
  report.files = files;
  if (files.length) {
    const width = Math.max(...files.map((f) => f.path.length));
    for (const f of files) {
      const words = SETUP_WORDS[f.state];
      say(`     ${f.path.padEnd(width)}  ${f.state === "in-sync" ? style.dim(words) : words}`);
    }
  }
  const next: NextStep[] = [];
  if (files.some((f) => f.state === "unknown")) {
    next.push({ command: command("diff --all"), description: "compare them with the vault, by key" });
  }
  if (files.some((f) => !["in-sync", "unknown", "absent"].includes(f.state))) {
    next.push({ command: command("sync"), description: "bring them in line" });
  }
  report.next = next;
  if (next.length) {
    say();
    say("Next");
    const width = Math.max(...next.map((n) => n.command.length));
    for (const n of next) say(`  ${cmd(n.command.padEnd(width))}  ${style.dim(n.description ?? "")}`);
  } else if (files.length) {
    note(`${cmd(command("sync"), true)} keeps them in line with the vault from now on.`);
  }
  emit(report);
}

async function chooseProject(
  args: ParsedArgs,
  choices: ProjectChoice[],
  deps: SetupDeps,
): Promise<ProjectChoice> {
  if (choices.length === 0) {
    throw new CliError("not_found", "Your vault has no env files yet.", {
      hint: "Add them at klef.sh, then run this again.",
    });
  }

  const named = flagValue(args, "project");
  if (named) {
    const found = findChoice(choices, flagValue(args, "workspace"), named);
    if (!found) {
      throw new CliError("not_found", `No single project called "${named}" in your vault.`, {
        hint: "Add --workspace if two workspaces have a project by that name.",
        next: [command("list")],
      });
    }
    return found;
  }
  if (choices.length === 1) return choices[0]!;

  // An agent ran this, or nobody can answer. The choices are names only; the
  // user picks, and the agent reruns with the flags.
  const needChoice = new CliError("confirmation_required", "Which project is this directory? It needs a choice.", {
    hint: `Ask the user which one (${choices.map(describeChoice).join("; ")}), then rerun:`,
    next: [command("setup --workspace <workspace> --project <project>")],
    data: {
      choices: choices.map((c) => ({ workspace: c.workspace, project: c.project, files: c.files.map((f) => f.name) })),
    },
  });
  if (!uiMode().input || uiMode().json) throw needChoice;

  say(`${style.dim("2/4")}  Which project is this directory?`);
  choices.forEach((c, i) => say(`       ${i + 1}. ${describeChoice(c)}`));

  let answer: string;
  try {
    answer = await deps.line(`Number (1-${choices.length}): `);
  } catch (err) {
    if (!(err instanceof NoTerminalError)) throw err;
    throw needChoice;
  }
  const picked = choices[Number.parseInt(answer.trim(), 10) - 1];
  if (!picked) throw new CliError("usage", "Not one of the options. Nothing linked.");
  return picked;
}

const VERB = { create: "create", update: "update" } as const;

/**
 * Write the instruction files agents load on their own: a Claude Code skill
 * and a Cursor rule by default, or CLAUDE.md and AGENTS.md when named. With
 * `--global` the Claude Code skill goes in the home directory and applies to
 * every project.
 *
 * Nothing is written without a yes: typed at the terminal, or `--yes` from an
 * agent that has already asked the user in its chat. Files we did not write
 * are never overwritten, and shared ones only ever have our marked block
 * replaced. `report` is setup's own --json result when called from setup;
 * otherwise this is the whole command and emits its own.
 */
async function installAgentFiles(
  args: ParsedArgs,
  cwd: string,
  deps: SetupDeps,
  report: Record<string, unknown> | null = null,
): Promise<number> {
  const global = hasFlag(args, "global");
  const root = global ? deps.home : cwd;

  const named = args.positionals.includes("all")
    ? (global ? GLOBAL_TARGETS : SETUP_TARGETS)
    : args.positionals;
  const unknown = named.filter((name) => !isSetupTarget(name));
  if (unknown.length > 0) {
    throw new CliError("usage", `Unknown target "${unknown[0]}". Choose from: ${SETUP_TARGETS.join(", ")}, or all.`);
  }

  const targets = named.length > 0 ? (named as SetupTarget[]) : DEFAULT_TARGETS;
  const local = global ? targets.filter((t) => !GLOBAL_TARGETS.includes(t)) : [];
  if (local.length > 0) {
    // Cursor keeps user-wide rules in its settings rather than in a file, and
    // AGENTS.md is read per repository, so there is nowhere global to put them.
    throw new CliError("usage", `${local.join(", ")} can only be set up per project.`, {
      hint: "Run it inside one:",
      next: [command(`setup ${local.join(" ")}`)],
    });
  }

  const existing = new Map<string, string | null>();
  for (const target of targets) {
    const rel = targetPath(target, global).path;
    existing.set(rel, await readOrNull(path.join(root, rel)));
  }
  const plan = planSetup(targets, (rel) => existing.get(rel) ?? null, invocationName(), global);

  const where = global ? "~" : ".";
  const files = plan.map((item) => ({ path: `${where}/${item.path}`, action: item.action }));
  if (report) report.agentFiles = files;
  const own = report === null;
  for (const item of plan) {
    if (item.action === "conflict") {
      say(`     ${style.yellow("skip".padEnd(8))} ${where}/${item.path} ${style.dim("(not written by klef; left alone)")}`);
    } else if (item.action === "unchanged") {
      say(`     ${style.dim("current".padEnd(8))} ${where}/${item.path}`);
    }
  }

  const writes = plan.filter(
    (item): item is PlannedWrite & { action: "create" | "update"; contents: string } =>
      item.contents !== null && (item.action === "create" || item.action === "update"),
  );
  if (writes.length === 0) {
    say(style.dim("     Nothing to write."));
    if (own) emit({ agentFiles: files });
    return plan.some((item) => item.action === "conflict") ? 1 : 0;
  }

  for (const item of writes) say(`     ${VERB[item.action].padEnd(8)} ${where}/${item.path}`);
  say(
    style.dim(
      global
        ? "     They teach Claude Code in every project how to use Klef: commands and rules, never a value."
        : "     They teach coding agents here how to use Klef: commands and rules, never a value. Safe to commit.",
    ),
  );

  // An agent may only go ahead once the user has said yes in its chat, so
  // without a terminal this fails with the exact command to rerun with --yes.
  const question = writes.length === 1 ? "Write it?" : `Write ${writes.length} files?`;
  if (!(await confirmOrFail(question, "setup", args, deps.ask))) {
    say("     Nothing written.");
    return 1;
  }

  for (const item of writes) {
    const file = path.join(root, item.path);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, item.contents);
  }
  const one = writes.length === 1;
  done(`Wrote ${writes.length} ${one ? "file" : "files"}. New agent sessions pick ${one ? "it" : "them"} up`, "     ");
  if (own) emit({ agentFiles: files });
  return 0;
}

async function readOrNull(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") return null;
    throw err;
  }
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(() => true, () => false);
}
