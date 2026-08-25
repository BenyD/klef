// SPDX-License-Identifier: AGPL-3.0-or-later

import { command } from "./invocation.ts";
import { KlefApi } from "./api.ts";
import { loadToken } from "./credentials.ts";
import { apiBaseUrl } from "./paths.ts";

export class NotSignedInError extends Error {
  constructor() {
    super(`Not signed in. Run \`${command("login")}\` first.`);
  }
}

/** An authenticated client, or a clear instruction to sign in. */
export async function requireApi(env: NodeJS.ProcessEnv): Promise<KlefApi> {
  const stored = await loadToken(env);
  if (!stored) throw new NotSignedInError();
  return new KlefApi(apiBaseUrl(env), stored.token);
}
