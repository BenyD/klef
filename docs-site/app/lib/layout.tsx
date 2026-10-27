import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { GITHUB } from "./source";

// The Klef mark, "Strand": three bars woven into an asterisk, the last in
// ember. The path data is src/web/lib/strand.ts's STRAND_PATHS, copied here
// because the docs site does not import from the app; `pnpm test` checks the
// app's copy against the brand package.
const STRAND_PATHS = [
  "M67 17.091 L67 10 A8 8 0 0 0 51 10 L51 26.329 Z M51 51.732 L51 90 A8 8 0 0 0 67 90 L67 42.494 Z",
  "M70 81.177 L76.141 84.722 A8 8 0 0 0 84.141 70.866 L70 62.702 Z M48 50 L14.859 30.866 A8 8 0 0 0 6.859 44.722 L48 68.475 Z",
  "M13 51.732 L6.859 55.278 A8 8 0 0 0 14.859 69.134 L29 60.97 Z M51 48.268 L84.141 29.134 A8 8 0 0 0 76.141 15.278 L35 39.03 Z",
];

function Mark() {
  return (
    <svg viewBox="-8 -8 116 116">
      {STRAND_PATHS.map((d, i) => (
        <path key={d} d={d} fill={i === STRAND_PATHS.length - 1 ? "var(--primary)" : "currentColor"} />
      ))}
    </svg>
  );
}

/** The Klef tile, the wordmark, then "Docs". The mark matches the marketing header. */
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
    themeSwitch: { mode: "light-dark" },
  };
}
