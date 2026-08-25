// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Turns the bundle from vite.cli.config.ts into a publishable package.
//
// The repo is one package whose dependencies belong to the web app, so the CLI
// is published as a built artifact rather than as this package: dist/cli/ gets
// its own package.json declaring exactly what the bundle still needs at
// runtime, which is one optional native module and nothing else.

import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CLI_VERSION } from "../src/cli/version.ts";

const OUT = path.resolve(import.meta.dirname, "../dist/cli");

/**
 * The only bare import the bundle is allowed to keep. Native modules can't be
 * bundled, and this one is loaded through a try/catch so a missing or
 * unbuildable binding falls back to a 0600 file.
 */
const ALLOWED_EXTERNALS = new Set(["@napi-rs/keyring"]);

/**
 * Fail the build if a dependency crept into the bundle. This is the guarantee
 * the whole exercise exists for: `npx` should fetch one file, not the web
 * app's dependency tree.
 */
function assertNoStrayImports(code: string): void {
  const specifiers = [
    ...code.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g),
  ].map((m) => m[1]!);

  const stray = [
    ...new Set(
      specifiers.filter(
        (s) =>
          !s.startsWith("node:") &&
          !s.startsWith(".") &&
          !s.startsWith("/") &&
          !ALLOWED_EXTERNALS.has(s),
      ),
    ),
  ];

  if (stray.length) {
    throw new Error(
      `The CLI bundle imports packages it should have inlined: ${stray.join(", ")}. ` +
        `Either bundle them or add them to ALLOWED_EXTERNALS with a reason.`,
    );
  }
}

const bundle = path.join(OUT, "index.js");
const code = await readFile(bundle, "utf8");
assertNoStrayImports(code);

if (!code.startsWith("#!/usr/bin/env node")) {
  throw new Error("The CLI bundle lost its shebang; `klef` would not be executable.");
}

await writeFile(
  path.join(OUT, "package.json"),
  `${JSON.stringify(
    {
      name: "@klefsh/cli",
      version: CLI_VERSION,
      description:
        "Zero-knowledge .env sync. Pull your environment files without the server ever seeing them.",
      license: "AGPL-3.0-or-later",
      type: "module",
      bin: { klef: "index.js" },
      // Node's type stripping is why there is no build step in the repo; the
      // published bundle is plain JS, but keep the floor consistent.
      engines: { node: ">=22.18" },
      // Optional on purpose: without it the token falls back to a 0600 file.
      optionalDependencies: { "@napi-rs/keyring": "^1.3.0" },
      repository: { type: "git", url: "git+https://github.com/BenyD/klef.git" },
      homepage: "https://klef.sh",
      files: ["index.js", "README.md", "LICENSE"],
    },
    null,
    2,
  )}\n`,
);

await copyFile(
  path.resolve(import.meta.dirname, "../LICENSE"),
  path.join(OUT, "LICENSE"),
);

await writeFile(
  path.join(OUT, "README.md"),
  `# klef

Zero-knowledge \`.env\` sync — [klef.sh](https://klef.sh)

\`\`\`bash
npx @klefsh/cli login    # paste a token from Settings -> Security -> Developer
npx @klefsh/cli link     # connect this directory to a file in your vault
npx @klefsh/cli pull     # write it to disk
\`\`\`

The server only ever stores ciphertext. \`pull\` derives your key locally from a
passphrase read straight from the terminal, so nothing here — and nothing on
the server — can read your values.

Nothing is ever printed: \`pull\` writes a file (mode 0600) and reports a count.
That is deliberate, so the command is safe to hand to a coding agent.

Source: [github.com/BenyD/klef](https://github.com/BenyD/klef) (AGPL-3.0-or-later)
`,
);

const bytes = Buffer.byteLength(code);
console.log(
  `built @klefsh/cli ${CLI_VERSION} -> dist/cli (${(bytes / 1024).toFixed(1)} KB, 0 required dependencies)`,
);
