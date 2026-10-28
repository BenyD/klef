// Prerender the public marketing routes to static HTML after the client
// build. AI crawlers (GPTBot, ClaudeBot, PerplexityBot) don't execute
// JavaScript, so without this they see an empty SPA shell; with it, each
// marketing URL serves real content. Cloudflare's static assets resolve
// /security to security.html ("auto" html_handling), and the SPA re-renders
// over the markup on load.
//
// Run via: pnpm prerender (SSR-built by vite.prerender.config.ts, then
// executed with node against dist/client).

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { ThemeProvider } from "next-themes";
import { Landing } from "../src/web/components/Landing.tsx";
import { Security } from "../src/web/components/Security.tsx";
import { Compare, FAQ } from "../src/web/components/Compare.tsx";
import { Pricing } from "../src/web/components/Pricing.tsx";
import { Terms } from "../src/web/components/Terms.tsx";
import { Privacy } from "../src/web/components/Privacy.tsx";
import { Why } from "../src/web/components/Why.tsx";
import { applyHead, htmlToText, sitemapXml, type FaqItem } from "../src/web/lib/seo.ts";

// Titles, descriptions and JSON-LD for each path live in src/web/lib/seo.ts.
const ROUTES = [
  // Not index.html: that stays the bare shell the SPA routes fall back to.
  // The Worker serves home.html for "/" (see src/api/index.ts).
  { path: "/", file: "home.html", Page: Landing },
  { path: "/compare", file: "compare.html", Page: Compare },
  { path: "/pricing", file: "pricing.html", Page: Pricing },
  { path: "/security", file: "security.html", Page: Security },
  { path: "/terms", file: "terms.html", Page: Terms },
  { path: "/privacy", file: "privacy.html", Page: Privacy },
  { path: "/about", file: "about.html", Page: Why },
];

// The /compare questions as plain text for its FAQPage JSON-LD, rendered
// from the same answers the page shows so the two cannot drift.
const faq: FaqItem[] = FAQ.map((item) => ({
  q: item.q,
  a: htmlToText(renderToStaticMarkup(<MemoryRouter>{item.a}</MemoryRouter>)),
}));

const clientDir = path.resolve(process.cwd(), "dist/client");
const template = readFileSync(path.join(clientDir, "index.html"), "utf8");

for (const { path: route, file, Page } of ROUTES) {
  const markup = renderToString(
    <MemoryRouter initialEntries={[route]}>
      {/* Mirror main.tsx so the server markup matches what mounts. */}
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        enableColorScheme={false}
        disableTransitionOnChange
      >
        <Page />
      </ThemeProvider>
    </MemoryRouter>,
  );

  const html = applyHead(template, route, route === "/compare" ? faq : []).replace(
    '<div id="root"></div>',
    `<div id="root">${markup}</div>`,
  );
  writeFileSync(path.join(clientDir, file), html);
  console.log(`prerendered ${route} -> dist/client/${file}`);
}

// Generated from ROUTES so a new marketing page cannot be left out of it.
writeFileSync(path.join(clientDir, "sitemap.xml"), sitemapXml(ROUTES.map((r) => r.path)));
console.log("wrote dist/client/sitemap.xml");
