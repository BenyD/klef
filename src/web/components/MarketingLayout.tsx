import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Menu, X } from "lucide-react";
import { KlefMark } from "./KlefMark.tsx";
import { ThemeGlyph } from "./ThemeToggle.tsx";
import { useThemeSwitch } from "../lib/use-theme-switch.ts";
import "../styles/marketing.css";

const GITHUB = "https://github.com/BenyD/klef";

// Plain anchors for the landing sections, not router links: from /security
// they load the landing page and land on the section, which a Link with a
// hash would not scroll to.
const SECTIONS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#agents", label: "Agents" },
  { href: "/#faq", label: "FAQ" },
];

// Shared chrome for the public marketing pages (landing, security, terms,
// privacy, about): header and footer around page-specific content.
export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="marketing">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}

/**
 * Sticky header. It is transparent at the top of the page and picks up a
 * blurred backdrop and a hairline once the page scrolls under it. The scroll
 * check runs in an effect, so the server render is the at-the-top state.
 */
function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 4);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  // The menu is a phone layout: Escape closes it, and so does growing the
  // window past the breakpoint where the inline links come back.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const wide = window.matchMedia("(min-width: 768px)");
    const onWide = () => wide.matches && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      window.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [menuOpen]);

  const close = () => setMenuOpen(false);

  return (
    <header
      className="m-header"
      data-scrolled={scrolled || menuOpen ? "true" : undefined}
    >
      <div className="m-header-inner">
        <Link to="/" className="marketing-brand" onClick={close}>
          <span className="marketing-brand-mark">
            <KlefMark className="size-3.5" />
          </span>
          Klef
        </Link>

        <nav className="m-header-nav" aria-label="Main">
          {SECTIONS.map((s) => (
            <a key={s.href} href={s.href}>
              {s.label}
            </a>
          ))}
          <Link to="/security">Security</Link>
          <Link to="/docs">Docs</Link>
        </nav>

        <div className="m-header-actions">
          <ThemeButton />
          <a
            href={GITHUB}
            target="_blank"
            rel="noreferrer"
            className="m-btn m-btn-ghost m-btn-sm m-btn-icon m-hide-phone"
            aria-label="Klef on GitHub"
          >
            <GitHubIcon />
          </a>
          <Link to="/auth" className="m-header-signin m-hide-phone">
            Sign in
          </Link>
          {/* Foreground, not ember: the page's own call to action is the one
              ember button in view (DESIGN.md, "One primary per view"). */}
          <Link to="/auth" className="m-btn m-btn-solid m-btn-sm">
            Get started
          </Link>
          <button
            type="button"
            className="m-btn m-btn-ghost m-btn-sm m-btn-icon m-menu-button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="m-mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav id="m-mobile-menu" className="m-mobile-menu" aria-label="Menu">
          {SECTIONS.map((s) => (
            <a key={s.href} href={s.href} onClick={close}>
              {s.label}
            </a>
          ))}
          <Link to="/security" onClick={close}>
            Security
          </Link>
          <Link to="/docs" onClick={close}>
            Docs
          </Link>
          <a href={GITHUB} target="_blank" rel="noreferrer" onClick={close}>
            GitHub
          </a>
          <Link to="/auth" className="m-mobile-menu-signin" onClick={close}>
            Sign in
          </Link>
        </nav>
      )}
    </header>
  );
}

const FOOTER_COLUMNS: {
  title: string;
  links: { label: string; to?: string; href?: string; external?: boolean }[];
}[] = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "For your agent", href: "/#agents" },
      { label: "Compared", href: "/#compare" },
      { label: "FAQ", href: "/#faq" },
      { label: "Sign in", to: "/auth" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", to: "/docs" },
      { label: "Security model", to: "/security" },
      { label: "CLI on npm", href: "https://www.npmjs.com/package/@klefsh/cli", external: true },
      { label: "Self-hosting", href: `${GITHUB}#self-hosting`, external: true },
      { label: "Report a vulnerability", href: `${GITHUB}/blob/main/SECURITY.md`, external: true },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", to: "/about" },
      { label: "Privacy", to: "/privacy" },
      { label: "Terms", to: "/terms" },
      { label: "GitHub", href: GITHUB, external: true },
    ],
  },
];

function SiteFooter() {
  return (
    <footer className="m-footer">
      <div className="m-footer-inner">
        <div className="m-footer-brand">
          <Link to="/" className="marketing-brand">
            <span className="marketing-brand-mark">
              <KlefMark className="size-3.5" />
            </span>
            Klef
          </Link>
          <p>
            End-to-end encrypted .env sync for one developer and their coding
            agents. Open source under{" "}
            <span className="m-nowrap">AGPL-3.0</span>, and self-hostable on
            Cloudflare.
          </p>
          <a
            href={GITHUB}
            target="_blank"
            rel="noreferrer"
            className="m-footer-github"
          >
            <GitHubIcon />
            BenyD/klef
          </a>
        </div>

        {FOOTER_COLUMNS.map((col) => (
          <nav key={col.title} className="m-footer-col" aria-label={col.title}>
            <h2>{col.title}</h2>
            <ul>
              {col.links.map((link) => (
                <li key={link.label}>
                  {link.to ? (
                    <Link to={link.to}>{link.label}</Link>
                  ) : (
                    <a
                      href={link.href}
                      {...(link.external
                        ? { target: "_blank", rel: "noreferrer" }
                        : {})}
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

      <div className="m-footer-base">
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
        <span>No analytics, no trackers, no ads.</span>
      </div>
    </footer>
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
