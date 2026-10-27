// SPDX-License-Identifier: AGPL-3.0-or-later

import { clearToken, loadToken } from "../credentials.ts";
import { done, emit, note, warn } from "../ui.ts";
import { forgetKey } from "../key-store.ts";

export async function logout(env: NodeJS.ProcessEnv): Promise<number> {
  const existing = await loadToken(env);
  await clearToken(env);
  // Signing out of this device forgets its vault key too.
  await forgetKey(env);
  const inEnv = existing?.source === "environment";

  if (!existing) done("Not signed in; nothing to forget");
  else if (inEnv) {
    done("Removed any stored token");
    warn("KLEF_TOKEN is still set in your environment, so klef still signs in with it.");
  } else {
    done("Signed out on this machine");
    note("The token stays valid until you revoke it in the web app (Settings, Security).");
  }
  emit({ signedOut: existing !== null && !inEnv, tokenStillInEnvironment: inEnv });
  return 0;
}
