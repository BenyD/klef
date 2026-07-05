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
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { ThemeProvider } from "next-themes";
import { Landing } from "../src/web/components/Landing.tsx";
import { Security } from "../src/web/components/Security.tsx";
import { Terms } from "../src/web/components/Terms.tsx";
import { Privacy } from "../src/web/components/Privacy.tsx";
import { Why } from "../src/web/components/Why.tsx";

const DEFAULT_TITLE = "Klef - Zero-knowledge .env sync";

const ROUTES = [
  { path: "/", file: "index.html", title: DEFAULT_TITLE, Page: Landing },
  { path: "/security", file: "security.html", title: "Security - Klef", Page: Security },
  { path: "/terms", file: "terms.html", title: "Terms - Klef", Page: Terms },
  { path: "/privacy", file: "privacy.html", title: "Privacy - Klef", Page: Privacy },
  { path: "/about", file: "about.html", title: "Why Klef", Page: Why },
];

const clientDir = path.resolve(process.cwd(), "dist/client");
const template = readFileSync(path.join(clientDir, "index.html"), "utf8");

for (const { path: route, file, title, Page } of ROUTES) {
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

  let html = template.replace(
    '<div id="root"></div>',
    `<div id="root">${markup}</div>`,
  );
  if (route !== "/") {
    // Per-page title (also og:title / twitter:title, which share the string)
    // and canonical/og:url. og:image and og:image:alt don't match either
    // pattern and stay as-is.
    html = html
      .replaceAll(DEFAULT_TITLE, title)
      .replaceAll('"https://klef.sh/"', `"https://klef.sh${route}"`);
  }
  writeFileSync(path.join(clientDir, file), html);
  console.log(`prerendered ${route} -> dist/client/${file}`);
}
