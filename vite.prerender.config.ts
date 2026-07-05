import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// SSR build for scripts/prerender.tsx only (see that file for why). Kept
// separate from vite.config.ts because the cloudflare() plugin there
// orchestrates its own client+worker build graph.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src/web") },
  },
  build: {
    ssr: "scripts/prerender.tsx",
    outDir: "dist/prerender",
    emptyOutDir: true,
  },
});
