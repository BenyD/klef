import { defineConfig } from "vite";

// Bundles the CLI into one dependency-free file for publishing.
//
// The repo is a single package whose dependencies belong to the web app —
// lucide-react, React, Base UI and friends. Installing that to run a CLI whose
// only real import is hash-wasm would drag ~100MB along, so the published
// artifact is built rather than shipped as source.
//
// Deliberately unminified. Klef's trust story is that you can read the code
// that touches your keys; a minified blob on npm would undercut that for the
// sake of a few hundred KB.
export default defineConfig({
  // The web app's public/ directory has nothing to do with the CLI.
  publicDir: false,
  // An SSR build externalises node_modules by default, which would leave
  // hash-wasm as a bare import and defeat the point. Everything gets bundled
  // except what `build.rollupOptions.external` pins.
  ssr: { noExternal: true },
  build: {
    ssr: "src/cli/index.ts",
    target: "node22",
    outDir: "dist/cli",
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      // node: builtins stay external; the keyring binding is a native module
      // that cannot be bundled, and is optional at runtime by design.
      external: [/^node:/, "@napi-rs/keyring"],
      output: {
        // The shebang already sits at the top of src/cli/index.ts and is
        // preserved through the bundle; a banner here would duplicate it.
        format: "esm",
        entryFileNames: "index.js",
      },
    },
  },
});
