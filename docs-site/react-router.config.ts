import type { Config } from "@react-router/dev/config";
import { glob } from "node:fs/promises";
import { join } from "node:path";
import { createGetUrl, getSlugs } from "fumadocs-core/source";

const pageUrl = createGetUrl("/docs");

export default {
  // Static only: every page is prerendered, and the SPA owns unknown paths.
  ssr: false,
  async prerender({ getStaticPaths }) {
    const paths = [...getStaticPaths()];
    for await (const entry of glob("**/*.mdx", { cwd: join(import.meta.dirname, "content", "docs") })) {
      const slugs = getSlugs(entry);
      paths.push(pageUrl(slugs), `/llms.mdx/${[...slugs, "content.md"].join("/")}`);
    }
    return paths;
  },
} satisfies Config;
