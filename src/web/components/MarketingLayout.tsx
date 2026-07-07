import type { ReactNode } from "react";
import { Link } from "react-router";
import { KeyRound } from "lucide-react";
import { ThemeGlyph } from "./ThemeToggle.tsx";
import { useThemeSwitch } from "../lib/use-theme-switch.ts";
import "../styles/marketing.css";

// Shared chrome for the public marketing pages (landing, security, terms,
// privacy): nav + footer around page-specific content.
export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="marketing">
      <nav className="marketing-nav">
        <Link to="/" className="marketing-brand">
          <span className="marketing-brand-mark">
            <KeyRound className="size-3.5" />
          </span>
          Klef
        </Link>
        <div className="marketing-nav-links">
          <ThemeButton />
          <a
            href="https://github.com/BenyD/klef"
            target="_blank"
            rel="noreferrer"
            className="m-btn m-btn-outline m-btn-sm"
          >
            <GitHubIcon />
            GitHub
          </a>
          <Link to="/auth" className="m-btn m-btn-primary m-btn-sm">
            Sign in
          </Link>
        </div>
      </nav>

      {children}

      <footer className="marketing-footer">
        <div className="marketing-footer-inner">
          <span>
            &copy; {new Date().getFullYear()} Klef. Built by{" "}
            <a
              href="https://beny.one"
              target="_blank"
              rel="noreferrer"
              className="marketing-credit"
            >
              <img src="/beny.png" alt="" className="marketing-credit-avatar" />
              Beny Dishon K
            </a>
            .
          </span>
          <nav className="marketing-footer-links">
            <Link to="/security">Security</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
            <a
              href="https://github.com/BenyD/klef/blob/main/LICENSE"
              target="_blank"
              rel="noreferrer"
            >
              AGPL-3.0
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function ThemeButton() {
  const toggle = useThemeSwitch();
  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={toggle}
      className="m-btn m-btn-ghost m-btn-sm m-btn-icon"
    >
      <ThemeGlyph className="size-4" />
    </button>
  );
}

export function GitHubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.2 3.44 9.6 8.2 11.16.6.11.82-.26.82-.58v-2.02c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.74.08-.74 1.2.09 1.84 1.25 1.84 1.25 1.07 1.85 2.81 1.31 3.5 1 .11-.79.42-1.31.76-1.61-2.67-.31-5.47-1.35-5.47-6a4.7 4.7 0 011.24-3.26 4.36 4.36 0 01.12-3.21s1.01-.33 3.3 1.25a11.4 11.4 0 016 0c2.29-1.58 3.3-1.25 3.3-1.25.65 1.66.24 2.88.12 3.21a4.7 4.7 0 011.24 3.26c0 4.66-2.81 5.68-5.49 5.98.43.38.82 1.11.82 2.24v3.32c0 .32.21.7.82.58A12.02 12.02 0 0024 12.29C24 5.78 18.63.5 12 .5z" />
    </svg>
  );
}
