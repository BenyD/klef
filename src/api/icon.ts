import { Hono } from "hono";
import type { AuthVariables } from "./middleware.ts";

// Favicon discovery: fetch a site's HTML server-side (CORS blocks the browser
// from doing it) and return the best icon declared in <link rel="icon">.
// Session-gated at the mount; the URL is validated to keep this from being an
// open proxy: https only, real hostnames only, HTML capped, and only the
// resolved icon URL is returned, never the page body.
export const icon = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const HTML_CAP_BYTES = 128 * 1024;
const FETCH_TIMEOUT_MS = 5_000;

function siteUrlFrom(input: string | undefined): URL | null {
  if (!input) return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname;
  // Real public hostnames only: no localhost-style names, no IP literals.
  if (!host.includes(".")) return null;
  if (/^[\d.]+$/.test(host) || host.includes(":")) return null;
  return url;
}

interface IconCandidate {
  href: string;
  rel: string;
  size: number;
}

/** Pick the best icon declared in the page head; exported for tests. */
export function pickIconFromHtml(html: string, base: URL): string | null {
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  const candidates: IconCandidate[] = [];

  for (const tag of links) {
    const rel = /\brel=["']?([^"'>\s]*(?:\s+[^"'>]*)?)["']?/i.exec(tag)?.[1]?.toLowerCase();
    if (!rel || !rel.includes("icon")) continue;
    const href = /\bhref=["']?([^"'>\s]+)["']?/i.exec(tag)?.[1];
    if (!href || href.startsWith("data:")) continue;
    const sizes = /\bsizes=["']?(\d+)x\d+["']?/i.exec(tag)?.[1];
    // SVGs scale; treat them as large. Unsized raster icons rank lowest.
    const size = /\.svg(\?|$)/i.test(href)
      ? 512
      : sizes
        ? parseInt(sizes, 10)
        : 0;
    candidates.push({ href, rel, size });
  }
  if (candidates.length === 0) return null;

  // Prefer plain icons over apple-touch (which assume their own rounding),
  // then the largest; break ties on document order.
  candidates.sort((a, b) => {
    const aTouch = a.rel.includes("apple") ? 1 : 0;
    const bTouch = b.rel.includes("apple") ? 1 : 0;
    if (aTouch !== bTouch) return aTouch - bTouch;
    return b.size - a.size;
  });

  try {
    return new URL(candidates[0]!.href, base).href;
  } catch {
    return null;
  }
}

/**
 * Conventional icon locations, probed in order when the HTML declares none.
 * SVG first (scales best), then the usual raster suspects. Exported for tests.
 */
export const FALLBACK_ICON_PATHS = [
  "/favicon.svg",
  "/apple-touch-icon.png",
  "/favicon.png",
  "/favicon.ico",
] as const;

async function probeFallbackIcon(origin: string): Promise<string | null> {
  for (const path of FALLBACK_ICON_PATHS) {
    try {
      const res = await fetch(origin + path, {
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const isImage =
        res.ok &&
        (res.headers.get("content-type") ?? "").startsWith("image/");
      await res.body?.cancel();
      if (isImage) return origin + path;
    } catch {
      // Unreachable or too slow; try the next location.
    }
  }
  return null;
}

icon.get("/", async (c) => {
  const site = siteUrlFrom(c.req.query("url"));
  if (!site) return c.json({ ok: false, error: "Invalid url" }, 400);

  let html = "";
  try {
    const res = await fetch(site.origin, {
      headers: { accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.ok && res.headers.get("content-type")?.includes("text/html")) {
      html = (await res.text()).slice(0, HTML_CAP_BYTES);
    } else {
      await res.body?.cancel();
    }
  } catch {
    // Fall through to the conventional locations.
  }

  const fromHtml = html ? pickIconFromHtml(html, new URL(site.origin)) : null;
  const found = fromHtml ?? (await probeFallbackIcon(site.origin));
  // Only https icons leave here; protocol-relative and path hrefs resolve
  // against the https origin above.
  return c.json({ icon: found?.startsWith("https://") ? found : null });
});
