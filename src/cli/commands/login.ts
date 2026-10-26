// SPDX-License-Identifier: AGPL-3.0-or-later

import { KlefApi } from "../api.ts";
import { saveToken, validateToken } from "../credentials.ts";
import { apiBaseUrl } from "../paths.ts";
import { promptSecret } from "../prompt.ts";
import { command } from "../invocation.ts";
import { beginDeviceLogin, openBrowser } from "../device-login.ts";
import { hasFlag, type ParsedArgs } from "../args.ts";
import { cmd, done, emit, note, say, style } from "../ui.ts";

/**
 * Sign in.
 *
 * The default is a browser approval: the CLI shows a short code, opens
 * klef.sh, and waits while you approve it there. Nothing is typed or pasted,
 * which matters because a pasted token is a live credential passing through a
 * clipboard and a terminal's scrollback.
 *
 * `--paste` keeps the old flow for machines with no browser.
 */
export async function login(
  args: ParsedArgs,
  env: NodeJS.ProcessEnv,
): Promise<number> {
  const base = apiBaseUrl(env);
  return hasFlag(args, "paste") ? pasteLogin(base, env) : browserLogin(base, env);
}

async function browserLogin(base: string, env: NodeJS.ProcessEnv): Promise<number> {
  const login = await beginDeviceLogin(base);

  // The code and the waiting go to stderr: they are for the person approving,
  // and stdout stays the result (or, with --json, one object).
  const url = `${login.verificationUri}?code=${encodeURIComponent(login.userCode)}`;
  console.error(`\n  Your code:  ${login.userCode}\n`);
  console.error(`Opening ${login.verificationUri} to approve it.`);
  console.error("Check the code on the page matches the one above before you approve.");
  console.error(`If no browser opens, visit ${url}`);
  openBrowser(url);
  console.error("\nWaiting for approval...");

  return finish(base, await login.collect(), env);
}

async function pasteLogin(base: string, env: NodeJS.ProcessEnv): Promise<number> {
  console.error(`Create an access token at ${base}: Settings, Security, Developer.`);
  console.error("Then paste it here. It won't be shown as you type.\n");
  return finish(base, validateToken(await promptSecret("Access token: ")), env);
}

async function finish(base: string, token: string, env: NodeJS.ProcessEnv): Promise<number> {
  // Confirm before storing, so a token that cannot be used never gets saved.
  const { user } = await new KlefApi(base, token).whoami();
  const source = await saveToken(token, env);
  const where = source === "keychain" ? "your OS keychain" : "a private file (0600)";
  done(`Signed in as ${user.email}`);
  say(style.dim(`  Token stored in ${where}. It reaches ciphertext and names only.`));
  note(`Next: ${cmd(command("setup"), true)} inside a repo, or ${cmd(command("link"), true)} to connect it by hand.`);
  emit({ email: user.email, tokenStore: source });
  return 0;
}
