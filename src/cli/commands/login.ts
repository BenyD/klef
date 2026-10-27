// SPDX-License-Identifier: AGPL-3.0-or-later

import { KlefApi } from "../api.ts";
import { saveToken, validateToken } from "../credentials.ts";
import { apiBaseUrl } from "../paths.ts";
import { promptSecret } from "../prompt.ts";
import { command } from "../invocation.ts";
import { beginDeviceLogin, openBrowser } from "../device-login.ts";
import { hasFlag, type ParsedArgs } from "../args.ts";
import { forgetKey, rememberEnabled, rememberKey, writeSettings } from "../key-store.ts";
import type { Bytes } from "../../shared/encoding.ts";
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
  if (hasFlag(args, "no-remember")) {
    await writeSettings(env, { rememberKey: false });
    await forgetKey(env);
  } else if (hasFlag(args, "remember")) {
    await writeSettings(env, { rememberKey: true });
  }
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

  const { token, openVaultKey } = await login.collect();
  return finish(base, token, env, openVaultKey);
}

async function pasteLogin(base: string, env: NodeJS.ProcessEnv): Promise<number> {
  console.error(`Create an access token at ${base}: Settings, Security, Developer.`);
  console.error("Then paste it here. It won't be shown as you type.\n");
  return finish(base, validateToken(await promptSecret("Access token: ")), env);
}

async function finish(
  base: string,
  token: string,
  env: NodeJS.ProcessEnv,
  openVaultKey: (userId: string) => Promise<Bytes | null> = async () => null,
): Promise<number> {
  // Confirm before storing, so a token that cannot be used never gets saved.
  const api = new KlefApi(base, token);
  const { user } = await api.whoami();
  const source = await saveToken(token, env);
  const where = source === "keychain" ? "your OS keychain" : "a private file (0600)";
  done(`Signed in as ${user.email}`);
  say(style.dim(`  Token stored in ${where}. It reaches ciphertext and names only.`));

  // The browser may also have unlocked this CLI: the vault key, sealed to the
  // key pair this login made. Kept on this device unless remembering is off.
  const unlocked = await keepVaultKey(api, env, await openVaultKey(user.id));
  if (unlocked === "remembered") {
    done("Unlocked on this device");
    note(
      `Pull, push and sync will not ask for the passphrase here. ${cmd(command("lock"), true)} forgets the key; ${cmd(command("login --no-remember"), true)} turns remembering off.`,
    );
  } else if (unlocked === "dropped") {
    note(`Remembering is off, so the key the browser sent was not kept. ${cmd(command("unlock"), true)} unlocks for a while.`);
  }
  note(`Next: ${cmd(command("setup"), true)} inside a repo, or ${cmd(command("link"), true)} to connect it by hand.`);
  emit({ email: user.email, tokenStore: source, unlocked: unlocked === "remembered" });
  return 0;
}

/** Keep the vault key the browser sent, if it sent one and it opens this vault. */
async function keepVaultKey(
  api: KlefApi,
  env: NodeJS.ProcessEnv,
  bytes: Bytes | null,
): Promise<"remembered" | "dropped" | "none"> {
  if (!bytes) return "none";
  try {
    if (!(await rememberEnabled(env))) return "dropped";
    const vault = await api.vault();
    if (!vault.exists || !vault.keyMaterial) return "none";
    // The seal's binding already says this key came from this approval by
    // this user. If it ever fails to decrypt, the key store forgets it and
    // the CLI asks for the passphrase (see vault-key.ts).
    return (await rememberKey(env, vault.keyMaterial, bytes)) ? "remembered" : "dropped";
  } finally {
    bytes.fill(0);
  }
}
