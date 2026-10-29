// SPDX-License-Identifier: MIT
//
// Builds the @klefsh/core package into dist/core: exactly the files
// src/shared/core.ts reaches, compiled by tsc to readable JavaScript with
// .d.ts declarations next to each, plus the blob format spec, the README and
// the licence from packages/core. JavaScript rather than the .ts sources
// because Node refuses to strip types from files under node_modules. The
// output is flat because every core file lives directly in src/shared.
//
// Before it finishes, it imports the built package with plain Node and checks
// that a blob round-trips byte for byte, so a broken emit cannot ship.
//
// Refuses to build if the core reaches outside src/shared or imports a
// package other than hash-wasm, and if packages/core/package.json disagrees
// with the repo on hash-wasm's version. The package stays private until it is
// published deliberately (repo split, step 4).

import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CORE_ENTRY, REPO, SHARED, openLicense, walkCore } from "./core-graph.ts";

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

// tsc follows core.ts's imports itself; the graph check above is what proves
// those imports stay inside src/shared.
const work = await mkdtemp(path.join(tmpdir(), "klef-core-"));
try {
  const tsconfig = path.join(work, "tsconfig.json");
  await writeFile(
    tsconfig,
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        // Web Crypto and TextEncoder: globals in browsers, Workers and Node.
        lib: ["ESNext", "DOM"],
        strict: true,
        skipLibCheck: true,
        declaration: true,
        rewriteRelativeImportExtensions: true,
        rootDir: SHARED,
        outDir: OUT,
      },
      files: [CORE_ENTRY],
    }),
  );
  execFileSync(path.join(REPO, "node_modules/.bin/tsc"), ["-p", tsconfig], { stdio: "inherit" });
} finally {
  await rm(work, { recursive: true, force: true });
}
await copyFile(path.join(SHARED, "BLOB_FORMAT.md"), path.join(OUT, "BLOB_FORMAT.md"));
await copyFile(path.join(REPO, "packages/core/README.md"), path.join(OUT, "README.md"));
await copyFile(openLicense(), path.join(OUT, "LICENSE"));
await writeFile(
  path.join(OUT, "package.json"),
  await readFile(path.join(REPO, "packages/core/package.json"), "utf8"),
);

// Smoke test the build as a consumer would load it.
const core = (await import(pathToFileURL(path.join(OUT, "core.js")).href)) as typeof import("../src/shared/core.ts");
const dek = await core.importAesKey(core.randomBytes(32));
const text = "# Heading\nA=1\nB='two words'\n";
if ((await core.decryptBlob(dek, await core.encryptBlob(dek, text))) !== text) {
  throw new Error("dist/core does not round-trip a blob");
}

console.log(
  `built @klefsh/core ${corePkg.version} -> dist/core (${graph.files.length} files, depends on ${[...graph.packages].join(", ")})`,
);
