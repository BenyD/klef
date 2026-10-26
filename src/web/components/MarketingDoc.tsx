import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { MarketingLayout } from "./MarketingLayout.tsx";

export interface DocSection {
  id: string;
  heading: string;
  body: ReactNode;
}

// Highlight the TOC entry for the section currently at the top of the
// viewport. A scroll listener beats IntersectionObserver here: with a handful
// of sections it is cheap, and it is exact when scrolling back up.
function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 130) current = id;
      }
      // At the very bottom, the last section may never reach the top edge.
      const doc = document.documentElement;
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 2) {
        current = ids[ids.length - 1];
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  return active;
}

// Document-style marketing page: sticky table of contents on the left
// (desktop), an "On this page" disclosure on phones, and the prose on a
// white panel in a card, like every section of the landing page.
export function MarketingDoc({
  kicker,
  title,
  updated,
  lead,
  intro,
  sections,
  children,
}: {
  /** Small label over the title, matching the landing page's sections. */
  kicker: string;
  title: string;
  updated?: string;
  lead: ReactNode;
  /** Optional figure between the lead and the first section. */
  intro?: ReactNode;
  sections: DocSection[];
  children?: ReactNode;
}) {
  const active = useScrollSpy(sections.map((s) => s.id));
  // Mobile-only disclosure state; on desktop the nav is always visible.
  const [tocOpen, setTocOpen] = useState(false);
  return (
    <MarketingLayout>
      <main className="marketing-doc m-wrap">
        <div className="marketing-doc-grid">
          <aside className="marketing-doc-toc" aria-label="Table of contents">
            <div className="marketing-doc-toc-inner">
              <button
                type="button"
                className="marketing-doc-toc-toggle"
                aria-expanded={tocOpen}
                onClick={() => setTocOpen((open) => !open)}
              >
                On this page
                <ChevronDown size={16} className="marketing-doc-toc-chevron" />
              </button>
              <span className="marketing-doc-toc-label">On this page</span>
              <nav data-open={tocOpen} onClick={() => setTocOpen(false)}>
                {sections.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    aria-current={s.id === active ? "true" : undefined}
                  >
                    {s.heading}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
          <div className="m-card">
            <article className="m-panel marketing-page">
              <p className="m-eyebrow">{kicker}</p>
              <h1>{title}</h1>
              <p className="marketing-page-lead">{lead}</p>
              {updated && (
                <p className="marketing-page-updated">Last updated {updated}</p>
              )}
              {intro && <div className="marketing-page-intro">{intro}</div>}
              {sections.map((s) => (
                <section key={s.id} id={s.id}>
                  <h2>
                    <a href={`#${s.id}`} className="marketing-doc-anchor">
                      {s.heading}
                    </a>
                  </h2>
                  {s.body}
                </section>
              ))}
              {children}
            </article>
          </div>
        </div>
      </main>
    </MarketingLayout>
  );
}
