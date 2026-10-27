import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { GITHUB } from "./source";

/** The Klef tile, the wordmark, then "Docs". The tile matches the app's mark. */
function Title() {
  return (
    <span className="klef-title">
      <span className="klef-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 4.9v14.2" />
          <path d="M5.85 8.45 18.15 15.55" />
          <path d="M18.15 8.45 5.85 15.55" />
        </svg>
      </span>
      <span className="klef-wordmark">Klef</span>
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
