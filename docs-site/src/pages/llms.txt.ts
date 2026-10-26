// /docs/llms.txt: an index of the docs in the llms.txt format
// (https://llmstxt.org), each entry pointing at the page's Markdown twin.
import type { APIRoute } from "astro";
import { markdownUrl, orderedPages } from "../lib/pages.ts";

export const GET: APIRoute = async () => {
  const pages = await orderedPages();
  const lines = [
    "# Klef Docs",
    "",
    "> Klef is an end-to-end encrypted vault for .env files, with a web app at",
    "> klef.sh and a CLI (@klefsh/cli) that never prints a secret value. These",
    "> are its docs, one Markdown file per page.",
    "",
    "The whole set as one file: https://klef.sh/docs/llms-full.txt",
    "",
    "## Pages",
    "",
    ...pages.map(
      (p) =>
        `- [${p.data.title}](${markdownUrl(p)})${p.data.description ? `: ${p.data.description}` : ""}`,
    ),
    "",
  ];
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
