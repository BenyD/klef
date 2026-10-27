import type { Route } from "./+types/docs";
import { use } from "react";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { ArrowUpRight } from "lucide-react";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from "fumadocs-ui/layouts/docs/page";
import { useMDXComponents } from "@/components/mdx";
import { baseOptions } from "@/lib/layout";
import { docs, GITHUB, markdownUrl, SITE, source } from "@/lib/source";

export async function loader({ params }: Route.LoaderArgs) {
  const slugs = params["*"].split("/").filter(Boolean);
  const page = source.getPage(slugs);
  if (!page) throw new Response("Not found", { status: 404 });

  return {
    path: page.path,
    url: page.url,
    markdownUrl: markdownUrl(page),
    pageTree: await source.serializePageTree(source.getPageTree()),
  };
}

function Content({ path, url, markdownUrl }: { path: string; url: string; markdownUrl: string }) {
  const page = docs.getPage(path);
  if (!page) throw new Error(`unknown page: ${path}`);
  const { toc } = use(page.load());
  const Mdx = page.body;
  const title = page.title === "Introduction" ? "Klef Docs" : `${page.title} - Klef Docs`;

  return (
    <DocsPage toc={toc}>
      <title>{title}</title>
      <meta name="description" content={page.description} />
      <link rel="canonical" href={`${SITE}${url}`} />
      <link rel="alternate" type="text/markdown" href={markdownUrl} />
      <DocsTitle>{page.title}</DocsTitle>
      <DocsDescription>{page.description}</DocsDescription>
      <div className="flex flex-row flex-wrap items-center gap-2 border-b pb-6 -mt-4">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover
          markdownUrl={markdownUrl}
          githubUrl={`${GITHUB}/blob/main/docs-site/content/docs/${path}`}
        />
      </div>
      <DocsBody>
        <Mdx components={useMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

/** The way into the product, in the sidebar's footer row beside GitHub and the theme switch. */
function OpenKlef() {
  return (
    <a href="/app" className="klef-open" target="_blank" rel="noreferrer">
      Open Klef
      <ArrowUpRight aria-hidden="true" />
    </a>
  );
}

export default function Page({ loaderData }: Route.ComponentProps) {
  const { pageTree, path, url, markdownUrl } = useFumadocsLoader(loaderData);

  return (
    <DocsLayout {...baseOptions()} tree={pageTree} sidebar={{ footer: <OpenKlef /> }}>
      <Content path={path} url={url} markdownUrl={markdownUrl} />
    </DocsLayout>
  );
}
