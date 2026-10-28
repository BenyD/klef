import { route, type RouteConfig } from "@react-router/dev/routes";

export default [
  route("docs/*", "routes/docs.tsx"),
  route("docs/search.json", "routes/search.ts"),
  route("docs/llms.txt", "llms/index.ts"),
  route("docs/llms-full.txt", "llms/full.ts"),
  route("docs/sitemap.xml", "llms/sitemap.ts"),
  // Each page as Markdown. scripts/publish.ts moves these to /docs/<page>.md,
  // a path React Router cannot route next to the docs/* pages.
  route("llms.mdx/*", "llms/page.ts"),
] satisfies RouteConfig;
