// SPDX-License-Identifier: AGPL-3.0-or-later
//
// `minVersion` in `.klef.json`: the oldest CLI a repo's link expects. A repo
// set up with a newer CLI can depend on what it wrote (a `files` list, file
// names), and an older one would misread it quietly; refusing says why.
//
// Purely local: the version is compared with the one compiled in. There is no
// network call and no update check, as `klef help` promises.

import { CliError } from "./ui.ts";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function isVersion(value: string): boolean {
  return SEMVER.test(value);
}

/** Negative when a < b, zero when equal, positive when a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = SEMVER.exec(a)!.slice(1).map(Number);
  const pb = SEMVER.exec(b)!.slice(1).map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i]! - pb[i]!;
  return 0;
}

/** Throw `outdated` when this CLI is older than the repo asks for. */
export function checkMinVersion(current: string, minVersion: string | undefined, rerun: string): void {
  if (!minVersion || !isVersion(current) || !isVersion(minVersion)) return;
  if (compareVersions(current, minVersion) >= 0) return;
  throw new CliError("outdated", `This repo expects klef ${minVersion} or newer; this is ${current}.`, {
    hint: "Run the latest instead (or update a global install with npm install -g @klefsh/cli):",
    next: [`npx @klefsh/cli@latest ${rerun}`.trimEnd()],
  });
}
