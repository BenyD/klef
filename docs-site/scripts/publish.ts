// Moves the docs build (docs-site/build/client) into the app's static assets
// at dist/client, so `pnpm deploy` ships both. Only the /docs tree comes
// across: React Router also writes an SPA fallback at the root, and the app
// owns every path outside /docs.
import { cp, glob, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const from = join(root, "docs-site", "build", "client");
const to = join(root, "dist", "client");

await rm(join(to, "docs"), { recursive: true, force: true });
await cp(join(from, "docs"), join(to, "docs"), { recursive: true });
// The loader data for /docs itself sits beside the directory, not in it.
await cp(join(from, "docs.data"), join(to, "docs.data"));

// /llms.mdx/<page>/content.md becomes /docs/<page>.md.
for await (const file of glob("**/content.md", { cwd: join(from, "llms.mdx") })) {
  const slug = dirname(file);
  const target = join(to, "docs", `${slug === "." ? "index" : slug}.md`);
  await mkdir(dirname(target), { recursive: true });
  await cp(join(from, "llms.mdx", file), target);
}

// Single-fetch data for the text exports, which nothing navigates to.
for (const file of ["llms.txt.data", "llms-full.txt.data", "sitemap.xml.data", "search.json.data"]) {
  await rm(join(to, "docs", file), { force: true });
}
