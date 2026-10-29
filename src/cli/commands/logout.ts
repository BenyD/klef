// SPDX-License-Identifier: MIT

import { ApiError, KlefApi } from "../api.ts";
import { clearToken, loadToken } from "../credentials.ts";
import { apiBaseUrl } from "../paths.ts";
import { done, emit, note, warn } from "../ui.ts";
import { forgetKey } from "../key-store.ts";

/**
 * Revoke the stored token on the server, so signing out leaves nothing behind
 * in the web app's token list. Best effort: offline, or against a server too
 * old to know the route, the local sign-out still happens.
 */
async function revoke(env: NodeJS.ProcessEnv, token: string): Promise<boolean> {
  try {
    await new KlefApi(apiBaseUrl(env), token).revokeSelf();
    return true;
  } catch (err) {
    // Rejected means it was already revoked or expired: nothing is left.
    return err instanceof ApiError && err.status === 401;
  }
}

export async function logout(env: NodeJS.ProcessEnv): Promise<number> {
  const existing = await loadToken(env);
  const inEnv = existing?.source === "environment";
  // A KLEF_TOKEN belongs to whatever set it (CI, a script); logging out of
  // this machine is no reason to kill it everywhere.
  const revoked = existing && !inEnv ? await revoke(env, existing.token) : false;
  await clearToken(env);
  // Signing out of this device forgets its vault key too.
  await forgetKey(env);

  if (!existing) done("Not signed in; nothing to forget");
  else if (inEnv) {
    done("Removed any stored token");
    warn("KLEF_TOKEN is still set in your environment, so klef still signs in with it.");
  } else if (revoked) {
    done("Signed out on this machine and revoked its token");
  } else {
    done("Signed out on this machine");
    note("Couldn't reach Klef to revoke the token, so it still works. Revoke it in the web app (Settings, Security, Access tokens).");
  }
  emit({ signedOut: existing !== null && !inEnv, revoked, tokenStillInEnvironment: inEnv });
  return 0;
}
