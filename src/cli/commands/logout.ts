// SPDX-License-Identifier: AGPL-3.0-or-later

import { clearToken, loadToken } from "../credentials.ts";

export async function logout(env: NodeJS.ProcessEnv): Promise<number> {
  const existing = await loadToken(env);
  await clearToken(env);

  if (!existing) {
    console.log("Not signed in.");
    return 0;
  }

  if (existing.source === "environment") {
    // Nothing on this machine to remove — the token came from the environment.
    console.log(
      "Removed any stored token, but KLEF_TOKEN is still set in your environment.",
    );
    return 0;
  }

  console.log("Signed out. The token still exists until you revoke it in the web app.");
  return 0;
}
