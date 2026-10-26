// /docs/llms-full.txt: every page, in reading order, in one Markdown file.
import type { APIRoute } from "astro";
import { asMarkdown, orderedPages } from "../lib/pages.ts";

export const GET: APIRoute = async () => {
  const pages = await orderedPages();
  return new Response(pages.map(asMarkdown).join("\n---\n\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
