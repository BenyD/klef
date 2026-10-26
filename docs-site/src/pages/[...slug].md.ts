// /docs/<page>.md: each page as plain Markdown, for agents and for anyone who
// wants to paste a page into a chat. Linked from every page's footer.
import type { APIRoute, GetStaticPaths } from "astro";
import { asMarkdown, orderedPages, type DocsPage } from "../lib/pages.ts";

export const getStaticPaths = (async () => {
  const pages = await orderedPages();
  return pages.map((page) => ({ params: { slug: page.id }, props: { page } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) =>
  new Response(asMarkdown((props as { page: DocsPage }).page), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
