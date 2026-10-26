// The docs at /docs are a separate static site (docs-site/, built by Astro
// into dist/client/docs), not an SPA route. Cloudflare serves them before the
// SPA fallback on a full load, so the SPA only sees /docs when a router Link
// navigated there client-side. Then it has to hand over with a real page
// load. If the page that was hard-loaded is itself /docs, the static files
// are missing (as under `pnpm dev`), and reloading would loop forever.

/**
 * Whether to leave the SPA with a full load. `loadedUrl` is the URL this
 * document was loaded from (the navigation timing entry's name), `href` the
 * current location.
 */
export function shouldLoadDocs(loadedUrl: string | undefined, href: string): boolean {
  if (!loadedUrl) return true;
  const strip = (u: string) => u.replace(/[?#].*$/, "").replace(/\/$/, "");
  return strip(loadedUrl) !== strip(href);
}
