import { loader } from "fumadocs-core/source";
import { flattenTree } from "fumadocs-core/page-tree";
import { defineDocs } from "fumadocs-mdx/macro";
import { pageHref } from "./urls";

export { SITE } from "./urls";
export const GITHUB = "https://github.com/BenyD/klef";

export const docs = defineDocs({
  dir: "content/docs",
  docs: { async: true },
});

export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: "/docs",
});

type Page = NonNullable<ReturnType<typeof source.getPage>>;

/** Every page in sidebar order (content/docs/meta.json), for the exports. */
export function orderedPages(): Page[] {
  const order = flattenTree(source.getPageTree().children).map((node) => node.url);
  return source.getPages().sort((a, b) => order.indexOf(a.url) - order.indexOf(b.url));
}

/** The page's Markdown twin, /docs/<page>.md. */
export function markdownUrl(page: Page): string {
  return `/docs/${page.slugs.length ? page.slugs.join("/") : "index"}.md`;
}

/** The page as one Markdown document: title, summary, then the body. */
export async function asMarkdown(page: Page): Promise<string> {
  const lines = [`# ${page.data.title}`, ""];
  if (page.data.description) lines.push(`> ${page.data.description}`, "");
  // The raw file, less its frontmatter, which the lines above restate.
  const body = (await page.data.getText("raw")).replace(/^---\n[\s\S]*?\n---\n/, "");
  lines.push(`Source: ${pageHref(page.url)}`, "", body.trim(), "");
  return lines.join("\n");
}
