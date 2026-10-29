// SPDX-License-Identifier: MIT
//
// The import graph of @klefsh/core, walked from src/shared/core.ts. Shared by
// scripts/core-boundary.test.ts, which enforces the boundary, and
// scripts/build-core.ts, which copies exactly these files into the package.
// Plain Node with type stripping: no enums, no parameter properties.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const REPO = path.resolve(import.meta.dirname, "..");
export const SHARED = path.join(REPO, "src/shared");
export const CORE_ENTRY = path.join(SHARED, "core.ts");

/**
 * The licence the CLI and core packages ship with. In the private repo the
 * root LICENSE is its own and the open one sits in the oss/ overlay; in the
 * public repo the overlay is the root, so there it is plain LICENSE.
 */
export function openLicense(root: string = REPO): string {
  const overlay = path.join(root, "oss/LICENSE");
  return existsSync(overlay) ? overlay : path.join(root, "LICENSE");
}

/** The only package the core may import. It supplies Argon2id. */
export const CORE_PACKAGES: ReadonlySet<string> = new Set(["hash-wasm"]);

/**
 * Every module specifier a TypeScript file imports or re-exports: static
 * `import ... from`, `export ... from`, side-effect `import "x"` and dynamic
 * `import("x")`. Comments are dropped first so prose cannot match.
 */
export function importSpecifiers(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const out: string[] = [];
  const patterns = [
    /\b(?:import|export)\s[^;]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /^\s*import\s*["']([^"']+)["']/gm,
  ];
  for (const re of patterns) {
    for (const m of code.matchAll(re)) out.push(m[1]!);
  }
  return out;
}

export interface CoreGraph {
  /** Absolute paths of every file in the core, the entry first. */
  files: string[];
  /** Packages the core imports. */
  packages: Set<string>;
  /** Human-readable boundary breaks; empty when the core is self-contained. */
  violations: string[];
}

/**
 * Walks the core from `entry`. The default is this checkout; the export
 * (scripts/oss) passes the core.ts of another tree, such as a past commit
 * extracted to a temporary directory, so the boundary is judged against the
 * entry's own src/shared.
 */
export function walkCore(entry: string = CORE_ENTRY): CoreGraph {
  const shared = path.dirname(entry);
  const root = path.resolve(shared, "../..");
  const rel = (file: string) => path.relative(root, file);
  const files: string[] = [];
  const packages = new Set<string>();
  const violations: string[] = [];
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    files.push(file);

    for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
      if (spec.startsWith(".")) {
        const target = path.resolve(path.dirname(file), spec);
        if (path.dirname(target) !== shared) {
          violations.push(`${rel(file)} imports ${spec}, which is outside src/shared`);
        } else if (!existsSync(target)) {
          violations.push(`${rel(file)} imports ${spec}, which does not exist`);
        } else {
          queue.push(target);
        }
      } else if (spec.startsWith("node:")) {
        violations.push(`${rel(file)} imports ${spec}; the core must also run in the browser`);
      } else {
        const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]!;
        packages.add(name);
        if (!CORE_PACKAGES.has(name)) {
          violations.push(`${rel(file)} imports the package ${spec}; the core may import only hash-wasm`);
        }
      }
    }
  }

  return { files, packages, violations };
}
