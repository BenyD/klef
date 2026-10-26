/* Renders public/og.png (1200x630) with satori + resvg: centered lockup
   (mark, wordmark, tagline) over an edge-faded ciphertext backdrop, with a
   masked env line as the signature element. Deterministic; rerun with
   `pnpm og`. */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { cipherGrid } from "./og-cipher.ts";

const WIDTH = 1200;
const HEIGHT = 630;

// Brand tokens from src/web/styles/global.css (dark), converted from oklch
// to hex because satori and resvg take sRGB.
const BG = "#0b0c0e"; // --sidebar, oklch(0.155 0.004 264): the dark marketing page
const CARD = "#161719"; // --card, oklch(0.205 0.004 264)
const FOREGROUND = "#eff0f2"; // --foreground, oklch(0.955 0.003 264)
const KEY = "#9b9ea5"; // --muted-foreground, oklch(0.7 0.01 264)
const FAINT = "#53555a"; // oklch(0.45 0.008 264)
const EMBER = "#f99549"; // --primary, oklch(0.76 0.15 55)

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
                ? `rgba(249, 149, 73, ${0.08 + token.shade * 0.08})`
                : `rgba(239, 240, 242, ${0.03 + token.shade * 0.04})`,
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
      width: 84,
      height: 84,
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
      // Clear the middle so the lockup floats on calm ground.
      h("div", {
        position: "absolute",
        top: 0,
        left: 0,
        width: WIDTH,
        height: HEIGHT,
        backgroundImage: `radial-gradient(circle at 50% 46%, ${BG} 30%, rgba(11, 12, 14, 0.55) 62%, rgba(11, 12, 14, 0) 100%)`,
      }),
      h(
        "div",
        {
          position: "absolute",
          top: 0,
          left: 0,
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
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
              marginTop: 36,
            },
            "Klef",
          ),
          h(
            "div",
            {
              color: FOREGROUND,
              fontSize: 40,
              fontWeight: 600,
              lineHeight: 1.2,
              marginTop: 30,
            },
            "Your .env files, encrypted and in sync",
          ),
          h(
            "div",
            {
              display: "flex",
              alignItems: "center",
              marginTop: 44,
              backgroundColor: CARD,
              border: "1px solid rgba(239, 240, 242, 0.09)",
              borderRadius: 12,
              padding: "16px 26px",
              fontFamily: "JetBrains Mono",
              fontSize: 26,
            },
            [
              h("span", { color: KEY }, "OPENAI_API_KEY"),
              h("span", { color: FAINT }, "="),
              h(
                "span",
                { color: EMBER, letterSpacing: "0.08em" },
                "************",
              ),
            ],
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
  ],
});

const png = new Resvg(svg, {
  fitTo: { mode: "width", value: WIDTH },
}).render();
const out = path.join(root, "public/og.png");
await writeFile(out, png.asPng());
console.log(`wrote ${out} (${WIDTH}x${HEIGHT})`);
