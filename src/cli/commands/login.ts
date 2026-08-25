// SPDX-License-Identifier: AGPL-3.0-or-later

import { KlefApi } from "../api.ts";
import { saveToken, validateToken } from "../credentials.ts";
import { apiBaseUrl } from "../paths.ts";
import { promptSecret } from "../prompt.ts";
import { command } from "../invocation.ts";
import { beginDeviceLogin, openBrowser } from "../device-login.ts";
import { hasFlag, type ParsedArgs } from "../args.ts";

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

  console.log(`\n  Your code:  ${login.userCode}\n`);
  console.log(`Opening ${login.verificationUri} to approve it.`);
  console.log("Check the code on the page matches the one above before you approve.\n");
  openBrowser(`${login.verificationUri}?code=${encodeURIComponent(login.userCode)}`);
  console.log("Waiting for approval...");

  const token = await login.collect();

  // Confirm before storing, so a token that cannot be used never gets saved.
  const { user } = await new KlefApi(base, token).whoami();
  const source = await saveToken(token, env);
  const where = source === "keychain" ? "your OS keychain" : "a private file (0600)";

  console.log(`\nSigned in as ${user.email}. Token stored in ${where}.`);
  console.log(`Next: run \`${command("link")}\` inside a repo to connect it to a file.`);
  return 0;
}

async function pasteLogin(base: string, env: NodeJS.ProcessEnv): Promise<number> {
  console.log(`Create an access token at ${base} -> Settings -> Security -> Developer.`);
  console.log("Then paste it here. It won't be shown as you type.\n");

  const token = validateToken(await promptSecret("Access token: "));

  const { user } = await new KlefApi(base, token).whoami();
  const source = await saveToken(token, env);
  const where = source === "keychain" ? "your OS keychain" : "a private file (0600)";

  console.log(`\nSigned in as ${user.email}. Token stored in ${where}.`);
  console.log(`Next: run \`${command("link")}\` inside a repo to connect it to a file.`);
  return 0;
}
