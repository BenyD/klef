import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Copy,
  KeyRound,
  LayoutGrid,
  PanelLeft,
  Plus,
  Search,
  Server,
  X,
} from "lucide-react";
import { MarketingLayout } from "./MarketingLayout.tsx";
import { AgentPrompts, OnboardAgentPill } from "./AgentPrompts.tsx";
import { KlefMark } from "./KlefMark.tsx";
import { PixelField } from "./PixelField.tsx";
import { Reveal } from "./Reveal.tsx";
import { Cmd, Done, Out, StepTabs, Yes } from "./LandingTerminal.tsx";

// The landing page: a hero, two sections and a closing line. The detail
// lives on its own pages (/compare, /security, /docs). Every transcript is
// the CLI's real output and none shows a value, because the CLI never prints
// one. The page is prerendered, so nothing here touches a browser API at
// render time.

export function Landing() {
  return (
    <MarketingLayout>
      <main className="m-main">
        <Hero />
        <HowItWorks />
        <Agents />
        <Closing />
      </main>
    </MarketingLayout>
  );
}

function Hero() {
  return (
    <section className="m-hero" aria-labelledby="hero-title">
      <div className="m-grid" aria-hidden="true">
        <PixelField className="m-hero-field" cell={32} cols={34} rows={18} count={96} seed={11} />
      </div>

      <div className="m-wrap m-hero-grid">
        <div className="m-hero-copy">
          <p className="m-label m-eyebrow m-beat">
            <KlefMark className="m-eyebrow-mark" />
            Open source and self-hostable
          </p>
          <h1 id="hero-title" className="m-beat">
            Your .env files, in sync on every machine.{" "}
            <span className="m-nowrap">
              Readable only by <mark className="m-hl">you</mark>.
            </span>
          </h1>
          <p className="m-hero-lead m-beat">
            Keep <code>.env.local</code> and <code>.env.production</code> the
            same on every machine. Encrypted on your device. Safe to hand to
            Claude Code and Cursor.
          </p>
          <div className="m-actions-row m-beat">
            <Link to="/auth" className="m-btn m-btn-ink">
              Get started free
              <ArrowRight className="m-arrow" />
            </Link>
            <Link to="/docs" className="m-btn m-btn-soft">
              <BookOpen />
              Read the docs
            </Link>
          </div>
          <div className="m-beat m-hero-tools">
            <CopyCommand />
            <OnboardAgentPill />
          </div>
        </div>

        <HeroStage />
      </div>
    </section>
  );
}

const VAULT_ROWS: [string, number][] = [
  ["DATABASE_URL", 9],
  ["STRIPE_SECRET_KEY", 12],
  ["OPENAI_API_KEY", 10],
  ["RESEND_API_KEY", 8],
  ["SENTRY_DSN", 11],
];

/** Which keys each environment defines, for the comparison card. */
const COMPARE_ROWS: [string, boolean, boolean][] = [
  ["DATABASE_URL", true, true],
  ["STRIPE_SECRET_KEY", true, true],
  ["OPENAI_API_KEY", true, true],
  ["RESEND_API_KEY", false, true],
  ["NEXT_PUBLIC_DEBUG", true, false],
];

const CYCLE_MS = 3800;
const SWAP_MS = 260;

/**
 * The product, drawn small, as three windows that take turns in front: the
 * app with a file open, the keys of two files side by side, and the CLI's
 * sync. Every CYCLE_MS the front window fades, drops to the back, and the
 * next one's rows rise in. Hover holds it, reduced motion stops it, and the
 * server renders the first order.
 */
function HeroStage() {
  const [order, setOrder] = useState([0, 1, 2]);
  const [leaving, setLeaving] = useState(false);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (held || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let swap = 0;
    const tick = window.setInterval(() => {
      setLeaving(true);
      swap = window.setTimeout(() => {
        setOrder((o) => [...o.slice(1), o[0]!]);
        setLeaving(false);
      }, SWAP_MS);
    }, CYCLE_MS);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(swap);
    };
  }, [held]);

  // Slot 0 is in front. A card's slot is where its id sits in the order.
  const slot = (id: number) => order.indexOf(id);
  const cls = (id: number, extra: string) =>
    `m-shot ${extra} m-slot-${slot(id)}${leaving && slot(id) === 0 ? " m-shot-leaving" : ""}`;

  return (
    <div
      className="m-stage"
      aria-hidden="true"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
    >
      <Window id={0} className={cls(0, "m-app")} front={slot(0) === 0}>
        <VaultCard />
      </Window>
      <Window id={1} className={cls(1, "m-app")} front={slot(1) === 0}>
        <CompareCard />
      </Window>
      <Window id={2} className={cls(2, "m-shot-term")} front={slot(2) === 0}>
        <div className="m-shot-bar">
          <span className="m-shot-dot" />
          <span className="m-shot-dot" />
          <span className="m-shot-dot" />
          <span className="m-shot-title">zsh</span>
        </div>
        <pre className="m-term m-term-sm">
          <Cmd>klef sync</Cmd>
          <Out>.env.local       edited here</Out>
          <Out>.env.production  changed in the vault</Out>
          <Out>Push .env.local: 14 variables (+1 lines)</Out>
          <Out>
            Push? [y/N] <Yes />
          </Out>
          <Done>Pushed 14 variables (+1 lines) to .env.local (version 3f9a2c1d)</Done>
          <Done>Wrote 9 variables to .env.production</Done>
        </pre>
      </Window>
    </div>
  );
}

/** Re-keyed when it comes to the front, so its rows play their entrance. */
function Window({ id, className, front, children }: { id: number; className: string; front: boolean; children: ReactNode }) {
  return (
    <div className={className} data-card={id}>
      <div key={front ? "front" : "back"} className="m-shot-body">
        {children}
      </div>
    </div>
  );
}

/**
 * The app's sidebar as it is: workspace switcher, the search field, the two
 * fixed rows, then the project tree with files in mono.
 */
function Sidebar() {
  return (
    <aside className="m-app-side">
      <div className="m-app-ws">
        <span className="m-app-tile">P</span>
        <span className="m-app-ws-text">
          <b>personal</b>
          <span>3 projects</span>
        </span>
        <ChevronsUpDown />
      </div>
      <div className="m-app-search">
        <Search />
        Search
        <kbd>&#8984;K</kbd>
      </div>
      <ul className="m-app-nav">
        <li>
          <LayoutGrid />
          All projects
        </li>
        <li>
          <KeyRound />
          Find a key
        </li>
      </ul>
      <p className="m-label">
        Projects
        <Plus />
      </p>
      <ul className="m-app-tree">
        <li className="m-app-open">
          <span className="m-app-proj">L</span>
          lensdrop
          <ChevronDown />
        </li>
        <li className="m-app-file">.env.local</li>
        <li className="m-app-file m-app-active">.env.production</li>
        <li className="m-app-file m-app-add">
          <Plus />
          New file
        </li>
        <li>
          <span className="m-app-proj">K</span>
          klef
        </li>
        <li>
          <span className="m-app-proj">P</span>
          portfolio
        </li>
      </ul>
    </aside>
  );
}

/** The content header: sidebar trigger, then the breadcrumb. */
function AppHead({ children }: { children: ReactNode }) {
  return (
    <div className="m-app-head">
      <PanelLeft className="m-app-trigger" />
      <span className="m-app-crumb">
        <span className="m-app-tile m-app-tile-sm">P</span>personal
      </span>
      <span className="m-app-sep">/</span>
      <span className="m-app-crumb">
        <span className="m-app-proj">L</span>lensdrop
      </span>
      <span className="m-app-sep">/</span>
      {children}
    </div>
  );
}

/** A file open: tabs for the open files, then the key table, values masked. */
function VaultCard() {
  return (
    <>
      <Sidebar />
      <div className="m-app-panel">
        <AppHead>
          <b className="m-app-crumb m-mono">
            .env.production
            <ChevronDown />
          </b>
          <span className="m-app-status">Saved</span>
        </AppHead>
        <div className="m-app-tabs">
          <span className="m-app-tab">.env.local</span>
          <span className="m-app-tab m-app-tab-active">
            .env.production
            <X />
          </span>
        </div>
        <ul className="m-env">
          {VAULT_ROWS.map(([key, n], r) => (
            <li key={key} style={{ "--d": `${120 + r * 60}ms` } as CSSProperties}>
              <span className="m-env-key">{key}</span>
              <span className="m-env-eq">=</span>
              <span className="m-env-val">{"\u2022".repeat(n)}</span>
            </li>
          ))}
          <li className="m-env-add">
            <Plus />
            <span>KEY</span>
            <span className="m-env-eq">=</span>
            <span>value</span>
          </li>
        </ul>
      </div>
    </>
  );
}

/** The compare dialog over the project: keys by environment, names only. */
function CompareCard() {
  return (
    <>
      <Sidebar />
      <div className="m-app-panel">
        <AppHead>
          <b className="m-app-crumb">Compare environments</b>
        </AppHead>
        <div className="m-dialog">
          <div className="m-dialog-head">
            <b>Compare environments</b>
            <span>Keys across lensdrop's environments. Decrypted in your browser only.</span>
          </div>
          <table className="m-vault m-compare">
            <thead>
              <tr>
                <th>Key</th>
                <th>development</th>
                <th>production</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map(([key, local, prod], r) => (
                <tr key={key} style={{ "--d": `${120 + r * 60}ms` } as CSSProperties}>
                  <td className="m-mono">{key}</td>
                  {[local, prod].map((has, c) => (
                    <td key={c}>
                      {has ? (
                        <span className="m-chk" style={{ "--d": `${260 + r * 60 + c * 40}ms` } as CSSProperties}>
                          <Check />
                        </span>
                      ) : (
                        <span className="m-none">&mdash;</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function HowItWorks() {
  return (
    <section className="m-section" id="how-it-works" aria-labelledby="how-title">
      <div className="m-wrap">
        <Reveal className="m-section-head">
          <div>
            <p className="m-label">How it works</p>
            <h2 id="how-title" className="m-h2">
              One command per repo.
              <br />
              One per new machine.
            </h2>
            <p className="m-lede">
              Setup links a checkout to its files. Sync works out which side
              changed.
            </p>
          </div>
          <Link to="/docs/quickstart" className="m-btn m-btn-soft">
            <BookOpen />
            Quickstart
          </Link>
        </Reveal>
        <Reveal delay={80}>
          <StepTabs />
        </Reveal>
      </div>
    </section>
  );
}

/** The stepped pixel edge where the page turns dark, and back again. */
function PixelEdge({ flip }: { flip?: boolean }) {
  return (
    <div className={flip ? "m-edge m-edge-flip" : "m-edge"} aria-hidden="true">
      <i style={{ left: 0, width: 24, height: 48 }} />
      <i style={{ left: 24, width: 48, height: 24 }} />
      <i style={{ left: 96, width: 24, height: 24 }} />
      <i style={{ right: 120, width: 24, height: 24 }} />
      <i style={{ right: 48, width: 24, height: 24 }} />
      <i style={{ right: 0, width: 48, height: 48 }} />
    </div>
  );
}

function Agents() {
  return (
    <>
      <PixelEdge />
      <section className="m-dark" id="agents" aria-labelledby="agents-title">
        <div className="m-wrap">
          <Reveal className="m-section-head">
            <div>
              <p className="m-label">For coding agents</p>
              <h2 id="agents-title" className="m-h2">
                Agents never see your secrets.
                <br />
                <span className="m-dark-quiet">Your agent runs Klef. You hold the key.</span>
              </h2>
            </div>
            <Link to="/docs/guides/coding-agents" className="m-btn m-btn-paper">
              <Bot />
              Agent guide
            </Link>
          </Reveal>

          <Reveal className="m-band-grid" delay={80}>
            <pre className="m-session">
              <span className="m-you">&gt; pull the latest env files</span>
              {"\n"}
              <span className="m-call">&#9679; Bash(klef sync)</span>
              {"\n  This needs an interactive terminal. Run it yourself rather than through a script or agent.\n"}
              <span className="m-you">
                &#9679; The vault is locked. Run klef unlock in your own terminal and tell me when it is done.
              </span>
              {"\n"}
              <span className="m-you">&gt; done</span>
              {"\n"}
              <span className="m-call">&#9679; Bash(klef sync)</span>
              {"\n  "}
              <span className="m-call">Wrote 9 variables to .env.production</span>
            </pre>

            <ul className="m-facts">
              <li>
                <p className="m-label">Never printed</p>
                <h3>No value, ever</h3>
                <p>
                  No <code>klef get</code>, no <code>--print</code>. Pull writes the
                  file and reports a count.
                </p>
              </li>
              <li>
                <p className="m-label">Passphrase</p>
                <h3>Your terminal only</h3>
                <p>Read from your terminal. Never from stdin, a flag or the agent.</p>
              </li>
              <li>
                <p className="m-label">Setup</p>
                <h3>Taught once</h3>
                <p>Setup writes a Claude Code skill and a Cursor rule into the repo.</p>
              </li>
            </ul>
          </Reveal>

          <Reveal delay={120}>
            <AgentPrompts />
          </Reveal>
        </div>
      </section>
      <PixelEdge flip />
    </>
  );
}

const SETUP = "npx @klefsh/cli setup";

function CopyCommand() {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard?.writeText(SETUP);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the command is selectable text right there.
    }
  }
  return (
    <span className="m-cmd">
      <span>
        <span className="t-prompt">$ </span>
        {SETUP}
      </span>
      <button
        type="button"
        className="m-cmd-copy"
        onClick={() => void copy()}
        aria-label={copied ? "Copied" : "Copy the setup command"}
        data-copied={copied || undefined}
      >
        <span key={copied ? "check" : "copy"} className="m-copy-glyph">
          {copied ? <Check /> : <Copy />}
        </span>
      </button>
    </span>
  );
}

function Closing() {
  return (
    <section className="m-section m-closing" id="start" aria-labelledby="closing-title">
      <Reveal className="m-wrap m-closing-inner">
        <h2 id="closing-title" className="m-h2">
          Starting with Klef is simple, fast, and free.
        </h2>
        <p className="m-lede">
          Use klef.sh, or run it on your own Cloudflare account. Either way,
          the server cannot read your files.
        </p>
        <div className="m-actions-row">
          <Link to="/auth" className="m-btn m-btn-ink">
            Get started free
            <ArrowRight className="m-arrow" />
          </Link>
          <Link to="/docs/guides/self-hosting" className="m-btn m-btn-soft">
            <Server />
            Self-host guide
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
