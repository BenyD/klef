// Every docs page in reading order, for the plain-text exports (llms.txt,
// llms-full.txt, per-page .md). Mirrors the sidebar in astro.config.mjs:
// the same groups, and frontmatter `sidebar.order` inside a directory.
import { getCollection, type CollectionEntry } from "astro:content";

export type DocsPage = CollectionEntry<"docs">;

const SITE = "https://klef.sh/docs";

const GROUPS = [
  "index",
  "quickstart",
  "concepts/",
  "guides/",
  "cli",
  "security",
  "faq",
  "troubleshooting",
  "changelog",
];

function group(id: string): number {
  const i = GROUPS.findIndex((g) =>
    g.endsWith("/") ? id.startsWith(g) : id === g || id.startsWith(`${g}/`),
  );
  return i === -1 ? GROUPS.length : i;
}

export async function orderedPages(): Promise<DocsPage[]> {
  const pages = await getCollection("docs");
  return pages.sort(
    (a, b) =>
      group(a.id) - group(b.id) ||
      // A directory's index page leads its group.
      Number(b.id === "cli") - Number(a.id === "cli") ||
      (a.data.sidebar.order ?? 999) - (b.data.sidebar.order ?? 999) ||
      a.data.title.localeCompare(b.data.title),
  );
}

/** The page's own URL and its Markdown twin. */
export function pageUrl(page: DocsPage): string {
  return page.id === "index" ? `${SITE}/` : `${SITE}/${page.id}`;
}
export function markdownUrl(page: DocsPage): string {
  return `${SITE}/${page.id}.md`;
}

/** The page as one Markdown document: title, summary, then the body. */
export function asMarkdown(page: DocsPage): string {
  const lines = [`# ${page.data.title}`, ""];
  if (page.data.description) lines.push(`> ${page.data.description}`, "");
  lines.push(`Source: ${pageUrl(page)}`, "", (page.body ?? "").trim(), "");
  return lines.join("\n");
}
