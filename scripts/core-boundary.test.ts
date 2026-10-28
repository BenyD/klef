import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CORE_ENTRY, REPO, SHARED, importSpecifiers, walkCore } from "./core-graph.ts";

// The open core is the code a person has to trust: it decides what gets
// encrypted and how. These checks keep it a closed set, so it can be published
// as @klefsh/core and split from the server without dragging anything along.

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("the @klefsh/core boundary", () => {
  const graph = walkCore();
  const core = new Set(graph.files);

  it("stays inside src/shared and imports no package but hash-wasm", () => {
    expect(graph.violations).toEqual([]);
    expect([...graph.packages]).toEqual(["hash-wasm"]);
    for (const file of graph.files) expect(path.dirname(file)).toBe(SHARED);
  });

  it("includes the encryption and the env-text editing", () => {
    const names = graph.files.map((f) => path.basename(f));
    expect(names[0]).toBe(path.basename(CORE_ENTRY));
    for (const name of ["crypto.ts", "constants.ts", "env-table.ts", "env-drift.ts"]) {
      expect(names).toContain(name);
    }
  });

  it("is everything the CLI takes from outside src/cli", () => {
    const cli = path.join(REPO, "src/cli");
    const outside: string[] = [];
    for (const file of sourceFiles(cli)) {
      for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
        if (!spec.startsWith(".")) continue;
        const target = path.resolve(path.dirname(file), spec);
        if (target.startsWith(cli + path.sep)) continue;
        if (!core.has(target)) outside.push(`${path.relative(REPO, file)} -> ${spec}`);
      }
    }
    expect(outside).toEqual([]);
  });

  it("keeps packages/core/package.json on the repo's hash-wasm version", () => {
    const read = (p: string) => JSON.parse(readFileSync(path.join(REPO, p), "utf8"));
    const corePkg = read("packages/core/package.json");
    expect(corePkg.name).toBe("@klefsh/core");
    expect(corePkg.private).toBe(true);
    expect(corePkg.dependencies["hash-wasm"]).toBe(read("package.json").dependencies["hash-wasm"]);
  });
});

describe("importSpecifiers", () => {
  it("finds static, re-export, side-effect and dynamic imports", () => {
    const src = `
      import { a } from "./a.ts";
      import type {
        B,
      } from "./b.ts";
      export * from "./c.ts";
      import "./d.ts";
      const e = await import("./e.ts");
    `;
    expect(importSpecifiers(src).sort()).toEqual(["./a.ts", "./b.ts", "./c.ts", "./d.ts", "./e.ts"]);
  });

  it("ignores prose in comments", () => {
    const src = `// keys missing from "./nowhere.ts"\n/* import x from "y" */\nconst url = "https://x.dev";`;
    expect(importSpecifiers(src)).toEqual([]);
  });
});
