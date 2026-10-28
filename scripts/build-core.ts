// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Builds the @klefsh/core package into dist/core: exactly the files
// src/shared/core.ts reaches, copied as readable TypeScript, plus the blob
// format spec, the README and the licence from packages/core. The copy is flat
// because every core file lives directly in src/shared, so their relative
// imports keep working as they are.
//
// Refuses to build if the core reaches outside src/shared or imports a
// package other than hash-wasm, and if packages/core/package.json disagrees
// with the repo on hash-wasm's version. The package stays private until it is
// published deliberately (repo split, step 4).

import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { REPO, SHARED, walkCore } from "./core-graph.ts";

const OUT = path.join(REPO, "dist/core");

const graph = walkCore();
if (graph.violations.length) {
  throw new Error(`@klefsh/core is not self-contained:\n- ${graph.violations.join("\n- ")}`);
}

const corePkg = JSON.parse(
  await readFile(path.join(REPO, "packages/core/package.json"), "utf8"),
) as { version: string; dependencies?: Record<string, string> };
const rootPkg = JSON.parse(await readFile(path.join(REPO, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
};
const want = rootPkg.dependencies?.["hash-wasm"];
const have = corePkg.dependencies?.["hash-wasm"];
if (!want || want !== have) {
  throw new Error(
    `packages/core/package.json pins hash-wasm ${have ?? "(missing)"}, the repo uses ${want ?? "(missing)"}. Keep them equal.`,
  );
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const file of graph.files) {
  await copyFile(file, path.join(OUT, path.basename(file)));
}
await copyFile(path.join(SHARED, "BLOB_FORMAT.md"), path.join(OUT, "BLOB_FORMAT.md"));
await copyFile(path.join(REPO, "packages/core/README.md"), path.join(OUT, "README.md"));
await copyFile(path.join(REPO, "LICENSE"), path.join(OUT, "LICENSE"));
await writeFile(
  path.join(OUT, "package.json"),
  await readFile(path.join(REPO, "packages/core/package.json"), "utf8"),
);

console.log(
  `built @klefsh/core ${corePkg.version} -> dist/core (${graph.files.length} files, depends on ${[...graph.packages].join(", ")})`,
);
