// /llms.mdx/<page>/content.md: each page as plain Markdown. Published as
// /docs/<page>.md (scripts/publish.ts), and linked from every page.
import type { Route } from "./+types/page";
import { asMarkdown, source } from "@/lib/source";

export async function loader({ params }: Route.LoaderArgs) {
  const slugs = params["*"].split("/").filter(Boolean).slice(0, -1);
  const page = source.getPage(slugs);
  if (!page) return new Response("Not found", { status: 404 });
  return new Response(await asMarkdown(page), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
