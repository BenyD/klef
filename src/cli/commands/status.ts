// SPDX-License-Identifier: AGPL-3.0-or-later

import { KlefApi, UnauthorizedError } from "../api.ts";
import { loadToken } from "../credentials.ts";
import { apiBaseUrl } from "../paths.ts";
import { readProjectConfig } from "../project-file.ts";
import { CONFIG_FILENAME } from "../project-config.ts";

const SOURCE_LABEL = {
  keychain: "OS keychain",
  file: "config file",
  environment: "KLEF_TOKEN",
} as const;

export async function status(env: NodeJS.ProcessEnv, cwd: string): Promise<number> {
  const base = apiBaseUrl(env);
  console.log(`Server:  ${base}`);

  const stored = await loadToken(env);
  if (!stored) {
    console.log("Signed in: no — run `klef login`");
  } else {
    try {
      const { user } = await new KlefApi(base, stored.token).whoami();
      console.log(`Signed in: ${user.email} (token from ${SOURCE_LABEL[stored.source]})`);
    } catch (err) {
      const why = err instanceof UnauthorizedError ? "rejected" : "unverified";
      console.log(`Signed in: token ${why} (from ${SOURCE_LABEL[stored.source]})`);
    }
  }

  const config = await readProjectConfig(cwd);
  if (!config) {
    console.log(`Linked:    no ${CONFIG_FILENAME} here — run \`klef link\``);
  } else {
    const label = config.environment ? ` (${config.environment})` : "";
    console.log(
      `Linked:    ${config.workspace} / ${config.project} / ${config.file}${label}`,
    );
  }

  return 0;
}
