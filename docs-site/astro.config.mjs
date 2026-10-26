// The docs at klef.sh/docs. Astro Starlight, built into the app's static
// assets (dist/client/docs) after the Vite build, so `pnpm deploy` ships
// both. Colours come from the app's own tokens.css (src/styles/klef.css).
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://klef.sh",
  base: "/docs",
  outDir: "../dist/client/docs",
  // Same-origin assets live under /docs/_astro, apart from the app's /assets.
  build: { assets: "_astro" },
  trailingSlash: "ignore",
  integrations: [
    starlight({
      title: "Klef Docs",
      description:
        "Documentation for Klef, the end-to-end encrypted .env vault and its CLI.",
      favicon: "/favicon.svg",
      // The SPA owns every unknown path, /docs/* included.
      disable404Route: true,
      editLink: {
        baseUrl: "https://github.com/BenyD/klef/edit/main/docs-site/",
      },
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/BenyD/klef" },
      ],
      customCss: [
        "@fontsource-variable/inter",
        "@fontsource-variable/jetbrains-mono",
        "./src/styles/klef.css",
      ],
      components: {
        ThemeProvider: "./src/components/ThemeProvider.astro",
        ThemeSelect: "./src/components/ThemeSelect.astro",
        SiteTitle: "./src/components/SiteTitle.astro",
        SocialIcons: "./src/components/SocialIcons.astro",
        EditLink: "./src/components/EditLink.astro",
      },
      expressiveCode: {
        themes: ["github-dark-default", "github-light-default"],
        styleOverrides: {
          borderRadius: "var(--radius)",
          borderColor: "var(--border)",
          codeBackground: "var(--sidebar)",
          codeFontFamily: "var(--sl-font-mono)",
          uiFontFamily: "var(--sl-font)",
          frames: {
            editorTabBarBackground: "var(--sidebar)",
            editorActiveTabBackground: "var(--sidebar)",
            terminalTitlebarBackground: "var(--sidebar)",
            terminalBackground: "var(--sidebar)",
            frameBoxShadowCssValue: "none",
          },
        },
      },
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Introduction", slug: "index" },
            "quickstart",
          ],
        },
        { label: "Concepts", items: [{ autogenerate: { directory: "concepts" } }] },
        { label: "Guides", items: [{ autogenerate: { directory: "guides" } }] },
        { label: "CLI reference", items: [{ autogenerate: { directory: "cli" } }] },
        {
          label: "Reference",
          items: ["security", "faq", "troubleshooting", "changelog"],
        },
      ],
    }),
  ],
});
