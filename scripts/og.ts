/* Renders public/og.png (1200x630) with satori + resvg. The layout mirrors
   the marketing hero: ciphertext backdrop, the ember mark from favicon.svg,
   wordmark, tagline, and URL. Deterministic; rerun with `pnpm og`. */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { cipherGrid } from "./og-cipher.ts";

const WIDTH = 1200;
const HEIGHT = 630;

// Brand tokens from src/web/styles/global.css (dark) and favicon.svg.
const BG = "#1c1917"; // stone-900
const FOREGROUND = "#fafaf9"; // stone-50
const MUTED = "#a8a29e"; // stone-400
const EMBER = "#fb923c";

const root = path.resolve(import.meta.dirname, "..");
const font = (pkg: string, file: string) =>
  readFile(path.join(root, "node_modules", pkg, "files", file));

type Node = string | { type: string; props: Record<string, unknown> };
const h = (
  type: string,
  style: Record<string, unknown>,
  children?: Node | Node[],
): Node => ({ type, props: { style, children } });

function cipherLayer(): Node {
  const rows = cipherGrid(20260722, 14, 9).map((row) =>
    h(
      "div",
      { display: "flex", gap: 34, whiteSpace: "pre" },
      row.map((token) =>
        h(
          "span",
          {
            color:
              token.kind === "env"
                ? `rgba(251, 146, 60, ${0.1 + token.shade * 0.1})`
                : `rgba(250, 250, 249, ${0.035 + token.shade * 0.045})`,
          },
          token.text,
        ),
      ),
    ),
  );
  return h(
    "div",
    {
      position: "absolute",
      top: -8,
      left: -20,
      width: WIDTH + 40,
      height: HEIGHT + 16,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      fontFamily: "JetBrains Mono",
      fontSize: 21,
      overflow: "hidden",
    },
    rows,
  );
}

async function markLayer(): Promise<Node> {
  const svg = await readFile(path.join(root, "public/favicon.svg"), "utf8");
  return {
    type: "img",
    props: {
      src: `data:image/svg+xml,${encodeURIComponent(svg)}`,
      width: 92,
      height: 92,
    },
  };
}

async function build(): Promise<Node> {
  return h(
    "div",
    {
      width: WIDTH,
      height: HEIGHT,
      display: "flex",
      backgroundColor: BG,
      position: "relative",
      fontFamily: "Inter",
    },
    [
      cipherLayer(),
      // Fade the backdrop out behind the text column so it stays readable.
      h("div", {
        position: "absolute",
        top: 0,
        left: 0,
        width: WIDTH,
        height: HEIGHT,
        backgroundImage: `linear-gradient(90deg, ${BG} 34%, rgba(28, 25, 23, 0.86) 55%, rgba(28, 25, 23, 0.2) 100%)`,
      }),
      h(
        "div",
        {
          position: "absolute",
          top: 0,
          left: 0,
          height: HEIGHT,
          padding: "78px 88px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          alignItems: "flex-start",
        },
        [
          await markLayer(),
          h(
            "div",
            {
              color: FOREGROUND,
              fontSize: 104,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1,
            },
            "Klef",
          ),
          h(
            "div",
            {
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 18,
            },
            [
              h(
                "div",
                {
                  color: FOREGROUND,
                  fontSize: 42,
                  fontWeight: 600,
                  lineHeight: 1.2,
                },
                "Sync your .env files without trusting the server",
              ),
              h(
                "div",
                { color: MUTED, fontSize: 28, lineHeight: 1.3 },
                "Zero-knowledge. Encrypted in your browser. Open source.",
              ),
            ],
          ),
          h(
            "div",
            {
              color: EMBER,
              fontFamily: "JetBrains Mono",
              fontSize: 26,
              fontWeight: 500,
            },
            "klef.sh",
          ),
        ],
      ),
    ],
  );
}

// Satori types want ReactNode, but it walks any {type, props} tree.
const tree = (await build()) as Parameters<typeof satori>[0];
const svg = await satori(tree, {
  width: WIDTH,
  height: HEIGHT,
  fonts: [
    {
      name: "Inter",
      weight: 400,
      data: await font("@fontsource/inter", "inter-latin-400-normal.woff"),
    },
    {
      name: "Inter",
      weight: 600,
      data: await font("@fontsource/inter", "inter-latin-600-normal.woff"),
    },
    {
      name: "Inter",
      weight: 700,
      data: await font("@fontsource/inter", "inter-latin-700-normal.woff"),
    },
    {
      name: "JetBrains Mono",
      weight: 400,
      data: await font(
        "@fontsource/jetbrains-mono",
        "jetbrains-mono-latin-400-normal.woff",
      ),
    },
    {
      name: "JetBrains Mono",
      weight: 500,
      data: await font(
        "@fontsource/jetbrains-mono",
        "jetbrains-mono-latin-500-normal.woff",
      ),
    },
  ],
});

const png = new Resvg(svg, {
  fitTo: { mode: "width", value: WIDTH },
}).render();
const out = path.join(root, "public/og.png");
await writeFile(out, png.asPng());
console.log(`wrote ${out} (${WIDTH}x${HEIGHT})`);
