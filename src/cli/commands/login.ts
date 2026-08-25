// SPDX-License-Identifier: AGPL-3.0-or-later

import { KlefApi } from "../api.ts";
import { saveToken, validateToken } from "../credentials.ts";
import { apiBaseUrl } from "../paths.ts";
import { promptSecret } from "../prompt.ts";

/**
 * Store an access token minted in the web app.
 *
 * The token is read from the terminal, never from argv — a token on the
 * command line ends up in `ps`, in shell history, and in the transcript of
 * whatever agent ran it.
 */
export async function login(env: NodeJS.ProcessEnv): Promise<number> {
  const base = apiBaseUrl(env);

  console.log(`Create an access token at ${base} → Settings → Security → Developer.`);
  console.log("Then paste it here. It won't be shown as you type.\n");

  const raw = await promptSecret("Access token: ");
  const token = validateToken(raw);

  // Verify before storing, so a typo fails now rather than on the next command.
  const api = new KlefApi(base, token);
  const { user } = await api.whoami();

  const source = await saveToken(token, env);
  const where = source === "keychain" ? "your OS keychain" : "a private file (0600)";
  console.log(`\nSigned in as ${user.email}. Token stored in ${where}.`);
  console.log("Next: run `klef link` inside a repo to connect it to a file.");
  return 0;
}
