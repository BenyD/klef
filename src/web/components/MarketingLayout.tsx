import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight, ArrowUp, Menu, X } from "lucide-react";
import { KlefMark } from "./KlefMark.tsx";
import { ThemeGlyph } from "./ThemeToggle.tsx";
import { useThemeSwitch } from "../lib/use-theme-switch.ts";

const GITHUB = "https://github.com/BenyD/klef";

// Shared chrome for the public marketing pages (landing, compare, security,
// terms, privacy, about): the header bar and the footer around the page.
export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="marketing" id="top">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}

/** The wordmark with the Strand mark; the last strand in ember. */
export function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <Link to="/" className="m-brand" onClick={onClick}>
      <KlefMark accent="var(--primary)" />
      klef
    </Link>
  );
}

// The pages, in the header. The landing page's sections are not listed: the
// page is short enough to scroll.
const NAV: { label: string; to: string }[] = [
  { label: "Docs", to: "/docs" },
  { label: "Security", to: "/security" },
  { label: "Compare", to: "/compare" },
  { label: "About", to: "/about" },
];

/**
 * A sticky bar with a hairline under it: the wordmark, the pages, and on the
 * right GitHub and the one primary action (the auth page signs you in or
 * creates the account, so there is no second button for it). Phones get a menu button
 * and a sheet of links, closed by Escape, a link, or widening the window.
 */
function SiteHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const wide = window.matchMedia("(min-width: 861px)");
    const onWide = () => wide.matches && setOpen(false);
    window.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      window.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className="m-header">
      <div className="m-wrap m-header-inner">
        <Brand onClick={close} />

        <nav className="m-nav" aria-label="Primary">
          {NAV.map((item) => (
            <Link key={item.label} to={item.to}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="m-actions">
          <a href={GITHUB} target="_blank" rel="noreferrer" className="m-btn m-btn-line m-hide-sm">
            <GitHubIcon />
            GitHub
          </a>
          <Link to="/auth" className="m-btn m-btn-ink">
            Get started free
            <ArrowRight className="m-arrow" />
          </Link>
          <button
            type="button"
            className="m-icon-btn m-menu-btn"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="m-menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="m-menu" className="m-menu" aria-label="Menu">
          {NAV.map((item) => (
            <Link key={item.label} to={item.to} onClick={close}>
              {item.label}
            </Link>
          ))}
          <a href={GITHUB} target="_blank" rel="noreferrer" onClick={close}>
            GitHub
          </a>
          <div className="m-menu-actions">
            <Link to="/auth" className="m-btn m-btn-ink" onClick={close}>
              Get started free
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}

type FooterLink = { label: string; to?: string; href?: string; external?: boolean };

const FOOTER_COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "For coding agents", href: "/#agents" },
      { label: "Security", to: "/security" },
      { label: "Compare", to: "/compare" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Documentation", to: "/docs" },
      { label: "Quickstart", to: "/docs/quickstart" },
      { label: "CLI reference", to: "/docs/cli" },
      { label: "Self-hosting", to: "/docs/guides/self-hosting" },
      { label: "CLI on npm", href: "https://www.npmjs.com/package/@klefsh/cli", external: true },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", to: "/about" },
      { label: "GitHub", href: GITHUB, external: true },
      { label: "Changelog", to: "/docs/changelog" },
      { label: "Report a vulnerability", href: `${GITHUB}/blob/main/SECURITY.md`, external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", to: "/terms" },
      { label: "Privacy", to: "/privacy" },
      { label: "AGPL-3.0 licence", href: `${GITHUB}/blob/main/LICENSE`, external: true },
    ],
  },
];

function SiteFooter() {
  return (
    <footer className="m-footer">
      <div className="m-wrap m-footer-grid">
        <div className="m-footer-brand">
          <Brand />
          <p>Encrypted .env sync for you and your coding agents.</p>
        </div>

        {FOOTER_COLUMNS.map((col) => (
          <nav key={col.title} className="m-footer-col" aria-label={col.title}>
            <h2 className="m-label">{col.title}</h2>
            <ul>
              {col.links.map((link) => (
                <li key={link.label}>
                  {link.to ? (
                    <Link to={link.to}>{link.label}</Link>
                  ) : (
                    <a
                      href={link.href}
                      {...(link.external ? { target: "_blank", rel: "noreferrer" } : {})}
                    >
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="m-wrap m-footer-base">
        <span className="m-label">&copy; {new Date().getFullYear()} Klef</span>
        <span className="m-footer-tools">
          <a href="#top" className="m-icon-btn" aria-label="Back to top">
            <ArrowUp />
          </a>
          <ThemeButton />
        </span>
      </div>
    </footer>
  );
}

function ThemeButton() {
  const toggle = useThemeSwitch();
  return (
    <button type="button" aria-label="Switch theme" onClick={toggle} className="m-icon-btn">
      <ThemeGlyph className="size-4" />
    </button>
  );
}

export function GitHubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.2 3.44 9.6 8.2 11.16.6.11.82-.26.82-.58v-2.02c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.74.08-.74 1.2.09 1.84 1.25 1.84 1.25 1.07 1.85 2.81 1.31 3.5 1 .11-.79.42-1.31.76-1.61-2.67-.31-5.47-1.35-5.47-6a4.7 4.7 0 011.24-3.26 4.36 4.36 0 01.12-3.21s1.01-.33 3.3 1.25a11.4 11.4 0 016 0c2.29-1.58 3.3-1.25 3.3-1.25.65 1.66.24 2.88.12 3.21a4.7 4.7 0 011.24 3.26c0 4.66-2.81 5.68-5.49 5.98.43.38.82 1.11.82 2.24v3.32c0 .32.21.7.82.58A12.02 12.02 0 0024 12.29C24 5.78 18.63.5 12 .5z" />
    </svg>
  );
}
