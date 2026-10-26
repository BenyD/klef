// The docs at klef.sh/docs: Fumadocs on React Router, prerendered to static
// HTML. Assets go under /docs/assets so the built tree can be dropped into
// the app's dist/client/docs (scripts/publish.ts) next to the app's /assets.
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [fumadocsMdx(), tailwindcss(), reactRouter()],
  build: { assetsDir: "docs/assets" },
  resolve: { tsconfigPaths: true },
});
