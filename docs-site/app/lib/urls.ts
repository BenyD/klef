// Absolute URLs for docs pages. Kept free of imports so it is testable
// without the MDX build (see urls.test.ts).

export const SITE = "https://klef.sh";

/**
 * The address a docs page is actually served at. Pages are prerendered to
 * <page>/index.html, so Cloudflare redirects /docs/cli to /docs/cli/; the
 * canonical, og:url, breadcrumbs and sitemap must name the URL that answers
 * 200, not the one that redirects.
 */
export function pageHref(url: string): string {
  return `${SITE}${url.endsWith("/") ? url : `${url}/`}`;
}
