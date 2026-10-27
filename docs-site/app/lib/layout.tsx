import { useId } from "react";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { GITHUB } from "./source";

// The woven asterisk, as in src/web/components/KlefMark.tsx: three loops,
// each cut by the ones drawn after it so the weave works in currentColor.
const LOOP = { x: 38, y: 12, width: 24, height: 76, rx: 12 };
const ANGLES = [0, 60, 120];

function Mark() {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg viewBox="0 0 100 100" fill="none">
      <defs>
        {ANGLES.slice(0, -1).map((_, i) => (
          <mask key={i} id={`${id}-${i}`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
            <rect width="100" height="100" fill="white" />
            {ANGLES.slice(i + 1).map((a) => (
              <rect key={a} {...LOOP} stroke="black" strokeWidth="18" transform={`rotate(${a} 50 50)`} />
            ))}
          </mask>
        ))}
      </defs>
      {ANGLES.map((a, i) => (
        <g key={a} mask={i < ANGLES.length - 1 ? `url(#${id}-${i})` : undefined}>
          <rect {...LOOP} stroke="currentColor" strokeWidth="9" transform={`rotate(${a} 50 50)`} />
        </g>
      ))}
    </svg>
  );
}

/** The Klef tile, the wordmark, then "Docs". The tile matches the favicon. */
function Title() {
  return (
    <span className="klef-title">
      <span className="klef-mark" aria-hidden="true">
        <Mark />
      </span>
      <span className="klef-wordmark">klef</span>
      <span className="klef-docs-label">Docs</span>
    </span>
  );
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: <Title />, url: "/docs" },
    githubUrl: GITHUB,
    links: [{ text: "Open Klef", url: "/app", external: true }],
    themeSwitch: { mode: "light-dark" },
  };
}
