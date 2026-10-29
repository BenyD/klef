// SPDX-License-Identifier: MIT

import { command } from "./invocation.ts";
import { KlefApi } from "./api.ts";
import { loadToken } from "./credentials.ts";
import { apiBaseUrl } from "./paths.ts";
import { CliError } from "./ui.ts";

export class NotSignedInError extends CliError {
  constructor() {
    super("not_signed_in", "Not signed in.", { next: [command("login")] });
  }
}

/** An authenticated client, or a clear instruction to sign in. */
export async function requireApi(env: NodeJS.ProcessEnv): Promise<KlefApi> {
  const stored = await loadToken(env);
  if (!stored) throw new NotSignedInError();
  return new KlefApi(apiBaseUrl(env), stored.token);
}
