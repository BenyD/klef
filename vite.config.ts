import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

const DOC_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

/**
 * The docs are a separate static site (docs-site/) that production serves
 * from dist/client/docs. The dev server has no such route, so every /docs
 * link on the marketing pages landed on the SPA's 404. This serves the last
 * build of the docs under pnpm dev when one exists, resolving /docs/x to
 * x.html or x/index.html the way Cloudflare's asset handling does. Run
 * pnpm build:docs to refresh them; pnpm docs:dev is still the way to edit.
 */
function builtDocs(): Plugin {
  const root = path.resolve(import.meta.dirname, "dist/client");
  return {
    name: "klef:built-docs",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0] ?? "";
        if (url !== "/docs" && !url.startsWith("/docs/")) return next();
        const rel = url.replace(/\/$/, "");
        const candidates = [rel, `${rel}.html`, `${rel}/index.html`].map((r) => path.join(root, r));
        for (const file of candidates) {
          if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
          res.setHeader("content-type", DOC_TYPES[path.extname(file)] ?? "application/octet-stream");
          fs.createReadStream(file).pipe(res);
          return;
        }
        next();
      });
    },
  };
}

// Single dev server: Vite serves the React SPA and runs the Hono Worker in the
// real workerd runtime with local emulation of bindings (D1, etc.).
export default defineConfig({
  plugins: [builtDocs(), react(), cloudflare(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src/web") },
  },
});
