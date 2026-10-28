// /docs/sitemap.xml: every docs page, for search engines (robots.txt points
// here beside the marketing sitemap at /sitemap.xml).
import { orderedPages } from "@/lib/source";
import { pageHref } from "@/lib/urls";

export function loader() {
  const urls = orderedPages().map((p) => `  <url>\n    <loc>${pageHref(p.url)}</loc>\n  </url>`);
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
