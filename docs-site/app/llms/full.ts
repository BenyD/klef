// /docs/llms-full.txt: every page, in reading order, in one Markdown file.
import { asMarkdown, orderedPages } from "@/lib/source";

export async function loader() {
  const pages = await Promise.all(orderedPages().map(asMarkdown));
  return new Response(pages.join("\n---\n\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
