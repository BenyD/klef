import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyHead,
  headTags,
  htmlToText,
  MARKETING_PAGES,
  sitemapXml,
  structuredData,
  type FaqItem,
} from "./seo.ts";

const shell = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
const faq: FaqItem[] = [{ q: "Is it free?", a: "Yes." }];

function jsonLd(html: string): { "@graph": Record<string, unknown>[] } {
  const match = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  if (!match?.[1]) throw new Error("no JSON-LD");
  return JSON.parse(match[1]);
}

describe("marketing page metadata", () => {
  it.each(Object.entries(MARKETING_PAGES))("%s has a usable title and description", (_, page) => {
    expect(page.title.length).toBeLessThanOrEqual(60);
    expect(page.description.length).toBeGreaterThan(50);
    expect(page.description.length).toBeLessThanOrEqual(180);
    // No em dashes in anything a user reads.
    expect(page.title + page.description).not.toMatch(/—/);
  });

  it("gives every page its own description", () => {
    const descriptions = Object.values(MARKETING_PAGES).map((p) => p.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });
});

describe("applyHead", () => {
  it("replaces the shell's noindex block with the page's own tags", () => {
    expect(shell).toContain('<meta name="robots" content="noindex" />');
    const html = applyHead(shell, "/security");
    expect(html).not.toContain("noindex");
    expect(html).toContain("<title>Security - Klef</title>");
    expect(html).toContain('<link rel="canonical" href="https://klef.sh/security" />');
    expect(html).toContain('<meta property="og:url" content="https://klef.sh/security" />');
    expect(html.match(/<title>/g)).toHaveLength(1);
    // The rest of the head survives.
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
  });

  it("canonicalises the landing page with a trailing slash", () => {
    expect(applyHead(shell, "/")).toContain('<link rel="canonical" href="https://klef.sh/" />');
  });

  it("refuses a template without the seo block", () => {
    expect(() => applyHead("<head><title>x</title></head>", "/")).toThrow(/seo/);
  });

  it("refuses an unknown path", () => {
    expect(() => headTags("/nope")).toThrow(/no SEO entry/);
  });

  it("escapes attribute values", () => {
    expect(headTags("/")).not.toMatch(/content="[^"]*<[^"]*"/);
  });
});

describe("structured data", () => {
  it("describes the app on every page and a breadcrumb off the landing page", () => {
    const home = structuredData("/") as { "@graph": Record<string, unknown>[] };
    const types = home["@graph"].map((n) => n["@type"]);
    expect(types).toEqual(["Organization", "WebSite", "SoftwareApplication", "WebPage"]);
    expect(home["@graph"][3]).not.toHaveProperty("breadcrumb");

    const about = jsonLd(headTags("/about"));
    const page = about["@graph"][3]!;
    expect(page["@type"]).toBe("AboutPage");
    expect(page.breadcrumb).toMatchObject({
      itemListElement: [{ position: 1, item: "https://klef.sh/" }, { position: 2, item: "https://klef.sh/about" }],
    });
  });

  it("puts the questions on /compare as an FAQPage", () => {
    const page = jsonLd(headTags("/compare", faq))["@graph"][3]!;
    expect(page["@type"]).toBe("FAQPage");
    expect(page.mainEntity).toEqual([
      { "@type": "Question", name: "Is it free?", acceptedAnswer: { "@type": "Answer", text: "Yes." } },
    ]);
  });

  it("refuses an FAQPage with no questions", () => {
    expect(() => structuredData("/compare")).toThrow(/no questions/);
  });

  it("cannot close its script tag early", () => {
    const tags = headTags("/compare", [{ q: "</script><script>alert(1)", a: "x" }]);
    expect(tags.match(/<\/script>/g)).toHaveLength(1);
    expect(jsonLd(tags)["@graph"][3]!.mainEntity).toMatchObject([{ name: "</script><script>alert(1)" }]);
  });
});

describe("htmlToText", () => {
  it("strips markup and decodes entities", () => {
    expect(htmlToText('Run <code>npx @klefsh/cli setup</code> &amp; <a href="/x">see&#x27;s</a>\n  more')).toBe(
      "Run npx @klefsh/cli setup & see's more",
    );
  });
});

describe("sitemapXml", () => {
  it("lists each path as an absolute URL", () => {
    const xml = sitemapXml(["/", "/about"]);
    expect(xml).toContain("<loc>https://klef.sh/</loc>");
    expect(xml).toContain("<loc>https://klef.sh/about</loc>");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });
});
