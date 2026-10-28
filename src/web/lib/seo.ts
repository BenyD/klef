// Search and answer-engine metadata for the public marketing pages: titles,
// descriptions, canonical URLs, Open Graph cards and schema.org JSON-LD.
// scripts/prerender.tsx writes it into each page's <head>; App.tsx reads the
// titles for client-side navigation. Pure string work, so it is tested
// headlessly and stays SSR-safe.

export const SITE = "https://klef.sh";
const GITHUB = "https://github.com/BenyD/klef";
const AUTHOR = { name: "Beny Dishon K", url: "https://beny.one" };
const OG_IMAGE = `${SITE}/og.png`;
const OG_IMAGE_ALT = "Klef - Your .env files, in sync on every Mac. Readable only by you.";

export interface MarketingPage {
  title: string;
  description: string;
  /** Short name for the breadcrumb trail. */
  name: string;
  /** schema.org WebPage subtype. */
  type: "WebPage" | "AboutPage" | "FAQPage";
}

export const MARKETING_PAGES: Record<string, MarketingPage> = {
  "/": {
    title: "Klef - End-to-end encrypted .env sync",
    description:
      "Keep .env.local and .env.production in sync on every machine, end-to-end encrypted. The CLI never prints a value, so Claude Code and Cursor can use it. Free and self-hostable.",
    name: "Home",
    type: "WebPage",
  },
  "/compare": {
    title: "Compare - Klef",
    description:
      "How Klef compares with hosted secrets managers like Doppler and Infisical, password managers, and encrypted .env files in git, plus answers to common questions.",
    name: "Compare",
    type: "FAQPage",
  },
  "/pricing": {
    title: "Pricing - Klef",
    description:
      "Pay once, no subscription: $49 for Klef hosted on klef.sh, or $29 for the self-host kit on your own Cloudflare account. 30 days free first.",
    name: "Pricing",
    type: "WebPage",
  },
  "/security": {
    title: "Security - Klef",
    description:
      "How Klef encrypts .env files on your device with AES-256-GCM and an Argon2id-derived key, so the server stores only ciphertext it cannot decrypt.",
    name: "Security",
    type: "WebPage",
  },
  "/terms": {
    title: "Terms - Klef",
    description: "The terms of service for Klef, the free, end-to-end encrypted .env sync tool at klef.sh.",
    name: "Terms",
    type: "WebPage",
  },
  "/privacy": {
    title: "Privacy - Klef",
    description:
      "What Klef stores and what it never sees: ciphertext only for your .env files, and no analytics, tracking scripts, or ads.",
    name: "Privacy",
    type: "WebPage",
  },
  "/about": {
    title: "Why Klef",
    description:
      "Why Klef exists: one encrypted place for your .env files, built for developers who work alongside coding agents like Claude Code and Cursor.",
    name: "About",
    type: "AboutPage",
  },
};

export interface FaqItem {
  q: string;
  /** Plain text, no markup. */
  a: string;
}

export function pageUrl(path: string): string {
  return path === "/" ? `${SITE}/` : `${SITE}${path}`;
}

/** The schema.org graph for one page: the site, the app, the page and its trail. */
export function structuredData(path: string, faq: FaqItem[] = []): object {
  const page = MARKETING_PAGES[path];
  if (!page) throw new Error(`no SEO entry for ${path}`);
  const url = pageUrl(path);
  const org = `${SITE}/#organization`;
  const website = `${SITE}/#website`;
  const app = `${SITE}/#software`;

  const graph: object[] = [
    {
      "@type": "Organization",
      "@id": org,
      name: "Klef",
      url: `${SITE}/`,
      logo: `${SITE}/apple-touch-icon.png`,
      founder: { "@type": "Person", ...AUTHOR },
      sameAs: [GITHUB, "https://www.npmjs.com/package/@klefsh/cli"],
    },
    {
      "@type": "WebSite",
      "@id": website,
      name: "Klef",
      url: `${SITE}/`,
      publisher: { "@id": org },
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      "@id": app,
      name: "Klef",
      url: `${SITE}/`,
      applicationCategory: "DeveloperApplication",
      applicationSubCategory: "Secrets management",
      operatingSystem: "Web, macOS, Linux, Windows",
      description:
        "Personal, end-to-end encrypted .env sync with a CLI that is safe to hand to coding agents. Environment files are encrypted on your device before they leave; the server never sees plaintext secrets.",
      featureList: [
        "End-to-end encrypted .env files (AES-256-GCM, Argon2id)",
        "Byte-for-byte file round trips with version history",
        "CLI that never prints a secret value, safe for Claude Code and Cursor",
        "Free, open source (AGPL-3.0) and self-hostable on Cloudflare",
      ],
      // One-time prices from src/shared/plans.ts; kept literal here because
      // this module is plain string work with no app imports.
      offers: [
        { "@type": "Offer", name: "Hosted", price: "49", priceCurrency: "USD" },
        { "@type": "Offer", name: "Self-host kit", price: "29", priceCurrency: "USD" },
      ],
      isAccessibleForFree: false,
      license: `${GITHUB}/blob/main/LICENSE`,
      author: { "@type": "Person", ...AUTHOR },
      publisher: { "@id": org },
      sameAs: [GITHUB],
    },
  ];

  const webPage: Record<string, unknown> = {
    "@type": page.type,
    "@id": `${url}#webpage`,
    url,
    name: page.title,
    description: page.description,
    isPartOf: { "@id": website },
    about: { "@id": app },
    inLanguage: "en",
  };
  if (path !== "/") {
    webPage.breadcrumb = {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Klef", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: page.name, item: url },
      ],
    };
  }
  if (page.type === "FAQPage") {
    if (faq.length === 0) throw new Error(`${path} is an FAQPage but has no questions`);
    webPage.mainEntity = faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    }));
  }
  graph.push(webPage);

  return { "@context": "https://schema.org", "@graph": graph };
}

function attr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

/** JSON for a <script> body: no "</script>" can close it early. */
function scriptJson(value: object): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

/** Everything the page's <head> says about it, for search engines and link previews. */
export function headTags(path: string, faq: FaqItem[] = []): string {
  const page = MARKETING_PAGES[path];
  if (!page) throw new Error(`no SEO entry for ${path}`);
  const url = pageUrl(path);
  const title = attr(page.title);
  const description = attr(page.description);
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />`,
    `<link rel="canonical" href="${url}" />`,
    `<link rel="alternate" type="text/plain" href="${SITE}/llms.txt" title="llms.txt" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Klef" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${attr(OG_IMAGE_ALT)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
    `<script type="application/ld+json">${scriptJson(structuredData(path, faq))}</script>`,
  ].join("\n    ");
}

const START = "<!-- seo -->";
const END = "<!-- /seo -->";

/**
 * Swap the app shell's generic head block (between the seo markers in
 * index.html, which also marks the shell noindex) for the page's own tags.
 * Throws if the markers are gone, so a template edit cannot silently ship
 * pages without metadata.
 */
export function applyHead(template: string, path: string, faq: FaqItem[] = []): string {
  const start = template.indexOf(START);
  const end = template.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("index.html is missing its <!-- seo --> block");
  }
  return template.slice(0, start) + headTags(path, faq) + template.slice(end + END.length);
}

/** Rendered HTML as plain text, for FAQ answers in JSON-LD. */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** sitemap.xml for the marketing pages; the docs list their own pages. */
export function sitemapXml(paths: string[]): string {
  const urls = paths.map((p) => `  <url>\n    <loc>${pageUrl(p)}</loc>\n  </url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
