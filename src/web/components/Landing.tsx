import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  BookOpen,
  Bot,
  Box,
  Check,
  ChevronRight,
  ChevronsUpDown,
  Code,
  Copy,
  Download,
  GitCompare,
  History,
  Import,
  KeyRound,
  LayoutGrid,
  Lock,
  Minus,
  PanelLeft,
  Plus,
  Save,
  Search,
  Server,
  Table2,
  X,
} from "lucide-react";
import { GitHubIcon, MarketingLayout } from "./MarketingLayout.tsx";
import { OnboardAgentPill } from "./AgentPrompts.tsx";
import { FrameworkIcon } from "./FrameworkIcon.tsx";
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
        <Evidence />
        <Showcase />
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
        <PixelField className="m-hero-field" cell={32} cols={34} rows={18} count={110} seed={11} />
      </div>

      <div className="m-wrap m-hero-grid">
        <div className="m-hero-copy">
          <a
            href="https://github.com/BenyD/klef"
            target="_blank"
            rel="noreferrer"
            className="m-label m-eyebrow m-beat"
          >
            <GitHubIcon />
            Open source and self-hostable
          </a>
          <h1 id="hero-title" className="m-beat">
            Your .env files, in sync on every machine.{" "}
            <span className="m-nowrap">
              Readable only by <mark className="m-hl">you</mark>.
            </span>
          </h1>
          <p className="m-hero-lead m-beat">
            One encrypted vault for every project's <code>.env</code> files,
            pulled wherever you code. The CLI never prints a value, so your
            coding agents can sync without seeing a secret.
          </p>
          <div className="m-actions-row m-beat">
            <Link to="/auth" className="m-btn m-btn-ink">
              Get started free
              <ArrowRight className="m-arrow" />
            </Link>
            <OnboardAgentPill />
          </div>
          <div className="m-beat m-hero-tools">
            <ManualSetup />
          </div>
        </div>

        <HeroStage />
      </div>
    </section>
  );
}

const GITGUARDIAN = "https://blog.gitguardian.com/the-state-of-secrets-sprawl-2026/";

/**
 * Three numbers under the hero, each with its source and year. The first
 * two are quoted from GitGuardian's State of Secrets Sprawl 2026 (checked
 * against the page on 27 Oct 2026; the leak-rate figure there is measured on
 * Claude Code-assisted commits). The third is Klef's own answer.
 */
function Evidence() {
  return (
    <section className="m-evidence" aria-labelledby="evidence-title">
      <div className="m-wrap">
        <Reveal className="m-evidence-grid">
          <div className="m-evidence-lead">
            <p className="m-label">Why now</p>
            <h2 id="evidence-title">
              Agents leak secrets twice as often. Klef lets yours sync .env
              files without ever seeing a value.
            </h2>
            <Link to="/compare" className="m-evidence-link">
              How Klef compares
              <ArrowRight />
            </Link>
          </div>
          <ul className="m-stats">
            <li>
              <b>28.65M</b>
              <span>new hardcoded secrets reached public GitHub in 2025, up 34% in a year.</span>
              <a href={GITGUARDIAN} target="_blank" rel="noreferrer">
                GitGuardian, 2026
              </a>
            </li>
            <li>
              <b>2&times;</b>
              <span>
                Commits written with a coding agent leaked secrets at 3.2%, against a 1.5%
                baseline.
              </span>
              <a href={GITGUARDIAN} target="_blank" rel="noreferrer">
                GitGuardian, 2026
              </a>
            </li>
            <li>
              <b>0</b>
              <span>
                values the Klef CLI prints, and <code>klef run</code> redacts them from your
                app's output.
              </span>
              <Link to="/security">How Klef does it</Link>
            </li>
          </ul>
        </Reveal>
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
 * fixed rows, the project tree with files in mono, and the user row at the
 * foot. `compact` is for the hero's small windows: fewer tree rows, so the
 * column still ends at the window's edge.
 */
function Sidebar({ compact = false }: { compact?: boolean }) {
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
      <p className="m-app-group">
        Projects
        <Plus />
      </p>
      <ul className="m-app-tree">
        <li className="m-app-open">
          <FrameworkIcon framework="nextjs" className="m-app-mark" />
          lensdrop
        </li>
        <li className="m-app-file">.env.local</li>
        <li className="m-app-file m-app-active">.env.production</li>
        {!compact && (
          <li className="m-app-file m-app-add">
            <Plus />
            New file
          </li>
        )}
        <li>
          <FrameworkIcon framework="vite" className="m-app-mark" />
          klef
        </li>
        {!compact && (
          <li>
            <FrameworkIcon framework="astro" className="m-app-mark" />
            portfolio
          </li>
        )}
      </ul>
      <div className="m-app-foot">
        <div className="m-app-user">
          <span className="m-app-avatar">S</span>
          <span className="m-app-ws-text">
            <b>Sam Lee</b>
            <span>sam@example.com</span>
          </span>
          <ChevronsUpDown />
        </div>
        <span className="m-app-lock">
          <Lock />
        </span>
      </div>
    </aside>
  );
}

/** The content header: sidebar trigger, then the breadcrumb. */
function AppHead({ children }: { children: ReactNode }) {
  return (
    <div className="m-app-head">
      <PanelLeft className="m-app-trigger" />
      <span className="m-app-crumb">
        <Box />
        personal
      </span>
      <ChevronRight className="m-app-sep" />
      <span className="m-app-crumb">
        <FrameworkIcon framework="nextjs" className="m-app-mark" />
        lensdrop
      </span>
      <ChevronRight className="m-app-sep" />
      {children}
    </div>
  );
}

/** The file crumb: its name, and the switcher between the project's files. */
function FileCrumb() {
  return (
    <b className="m-app-crumb m-mono m-app-crumb-file">
      <span>.env.production</span>
      <ChevronsUpDown />
    </b>
  );
}

/** The open-file tabs: the active one raised, with its close button. */
function FileTabs() {
  return (
    <div className="m-app-tabs">
      <span className="m-app-tab">.env.local</span>
      <span className="m-app-tab m-app-tab-active">
        .env.production
        <X />
      </span>
    </div>
  );
}

/** The file's toolbar: code or table, the icon actions, Save version. */
function FileToolbar() {
  return (
    <div className="m-app-bar">
      <span className="m-seg">
        <span>
          <Code />
        </span>
        <span className="is-on">
          <Table2 />
        </span>
      </span>
      <span className="m-app-bar-end">
        <span className="m-btn-group">
          <Copy />
          <Download />
          <Bot />
          <History />
        </span>
        <span className="m-app-save">
          <Save />
          Save version
        </span>
      </span>
    </div>
  );
}

/** A file open: tabs for the open files, then the key table, values masked. */
function VaultCard() {
  return (
    <>
      <Sidebar compact />
      <div className="m-app-panel">
        <AppHead>
          <FileCrumb />
        </AppHead>
        <FileTabs />
        <FileToolbar />
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
/**
 * Compare environments, as the app opens it: a dialog over the file, with
 * the Keys tab on, the drift line, and which file has each key.
 */
function CompareCard() {
  return (
    <>
      <Sidebar compact />
      <div className="m-app-panel">
        <AppHead>
          <FileCrumb />
        </AppHead>
        <FileTabs />
        <FileToolbar />
      </div>
      <div className="m-scrim" />
      <div className="m-dialog">
        <div className="m-dialog-head">
          <b>Compare environments</b>
          <span>
            Keys across lensdrop's environments, and where values differ. Decrypted in your
            browser only.
          </span>
        </div>
        <span className="m-seg m-seg-text">
          <span className="is-on">Keys</span>
          <span>Values</span>
        </span>
        <p className="m-drift">2 keys missing from some environments.</p>
        <div className="m-compare-box">
          <table className="m-compare">
            <thead>
              <tr>
                <th>Key</th>
                <th>
                  Development
                  <span>.env.local</span>
                </th>
                <th>
                  Production
                  <span>.env.production</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map(([key, local, prod]) => (
                <tr key={key}>
                  <td>{key}</td>
                  {[local, prod].map((has, c) =>
                    has ? (
                      <td key={c}>
                        <Check />
                      </td>
                    ) : (
                      <td key={c} className="m-miss">
                        <Minus />
                      </td>
                    ),
                  )}
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

// The stair into the dark band: blocks on a --px grid (24px, 16px on
// phones), as [column, height in cells], stepping down from each corner.
const STAIR_LEFT: [number, number][] = [
  [0, 2],
  [1, 2],
  [2, 1],
  [3, 1],
  [5, 1],
  [8, 1],
];
const STAIR_RIGHT: [number, number][] = [
  [0, 2],
  [1, 1],
  [2, 1],
  [4, 1],
  [7, 1],
];

/** The stepped pixel edge where the page turns dark, and back again. */
function PixelEdge({ flip }: { flip?: boolean }) {
  return (
    <div className={flip ? "m-edge m-edge-flip" : "m-edge"} aria-hidden="true">
      {STAIR_LEFT.map(([c, h]) => (
        <i key={`l${c}`} style={{ left: `calc(var(--px) * ${c})`, height: `calc(var(--px) * ${h})` }} />
      ))}
      {STAIR_RIGHT.map(([c, h]) => (
        <i key={`r${c}`} style={{ right: `calc(var(--px) * ${c})`, height: `calc(var(--px) * ${h})` }} />
      ))}
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
            {/* Claude Code's own layout around klef's real output: the locked
                error (src/cli/common.ts) on the first try, then sync's plan
                lines and the write, after the user unlocks. */}
            <pre className="m-session">
              <span className="m-ln m-you">&gt; pull the latest env files</span>
              <span className="m-ln m-tool m-tool-err">
                <i>&#9210;</i>Bash(klef sync)
              </span>
              <span className="m-ln m-out">
                <i>&#9151;</i>Error: Exit code 4
              </span>
              <span className="m-ln m-out m-err">
                &#10007; The vault is locked on this device, and unlocking it needs the user.
              </span>
              <span className="m-ln m-out m-faint">&hellip; +3 lines (ctrl+o to expand)</span>
              <span className="m-ln m-say">
                <i>&#9210;</i>The vault is locked on this machine. Run klef unlock in your own
                terminal, then tell me.
              </span>
              <span className="m-ln m-you">&gt; done</span>
              <span className="m-ln m-tool">
                <i>&#9210;</i>Bash(klef sync)
              </span>
              <span className="m-ln m-out">
                <i>&#9151;</i>.env.local       <span className="m-faint">in sync</span>
              </span>
              <span className="m-ln m-out">.env.production  changed in the vault</span>
              <span className="m-ln m-out">
                <span className="m-ok">&#10003;</span> Wrote 9 variables to .env.production
              </span>
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
        </div>
      </section>
      <PixelEdge flip />
    </>
  );
}

const SETUP = "npx @klefsh/cli setup";

/** The way in without an agent: one line, the command, a copy glyph. */
function ManualSetup() {
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
    <span className="m-manual">
      or set up manually
      <span className="m-manual-cmd">
        <code>{SETUP}</code>
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
    </span>
  );
}

const SHOWCASE_ROWS: [string, number][] = [
  ["DATABASE_URL", 9],
  ["DIRECT_URL", 9],
  ["STRIPE_SECRET_KEY", 12],
  ["STRIPE_WEBHOOK_SECRET", 10],
  ["OPENAI_API_KEY", 10],
  ["RESEND_API_KEY", 8],
  ["SENTRY_DSN", 11],
  ["NEXT_PUBLIC_APP_URL", 9],
];

/** Relative and absolute time, the two lines the app gives each version. */
const HISTORY = [
  ["2 minutes ago", "Oct 27, 1:55 PM", true],
  ["Yesterday", "Oct 26, 9:12 AM", false],
  ["8 days ago", "Oct 19, 6:40 PM", false],
  ["25 days ago", "Oct 2, 11:03 AM", false],
] as const;

/**
 * The app at full width: the shell with a file open and its version history
 * beside it, over the tinted panel, with the three things the table shows
 * best underneath. The same pieces as the hero's windows, drawn larger.
 */
function Showcase() {
  return (
    <section className="m-section" id="app" aria-labelledby="app-title">
      <div className="m-wrap">
        <Reveal className="m-section-head">
          <div>
            <p className="m-label">The app</p>
            <h2 id="app-title" className="m-h2">
              Every file, every machine,
              <br />
              one place.
            </h2>
            <p className="m-lede">
              Projects and files in the sidebar. Values decrypt only after you
              unlock, and every save keeps a version.
            </p>
          </div>
          <Link to="/auth" className="m-btn m-btn-soft">
            <LayoutGrid />
            Open the app
          </Link>
        </Reveal>

        <Reveal delay={80}>
          <div className="m-showcase" aria-hidden="true">
            <div className="m-shot m-app m-showcase-shot">
              <div className="m-shot-body">
                <Sidebar />
                <div className="m-app-panel">
                  <AppHead>
                    <FileCrumb />
                  </AppHead>
                  <FileTabs />
                  <FileToolbar />
                  <div className="m-app-split">
                    <ul className="m-env">
                      {SHOWCASE_ROWS.map(([key, n]) => (
                        <li key={key}>
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
                    <aside className="m-app-hist">
                      <div className="m-app-hist-head">
                        <History />
                        <b>Version history</b>
                        <span className="m-mono">.env.production</span>
                      </div>
                      <ol>
                        {HISTORY.map(([when, at, current], i) => (
                          <li key={when} className={current ? "is-current" : undefined}>
                            <span className="m-app-hist-rail">
                              <span className="m-app-hist-dot" />
                              {i < HISTORY.length - 1 && <span className="m-app-hist-line" />}
                            </span>
                            <span className="m-app-hist-text">
                              <span className="m-app-hist-when">
                                {when}
                                {current && <em>Current</em>}
                              </span>
                              <span className="m-app-hist-at">{at}</span>
                            </span>
                            {!current && (
                              <span className="m-app-hist-actions">
                                <span className="m-app-chip">
                                  <GitCompare />
                                  Compare
                                </span>
                                <span className="m-app-chip m-app-chip-line">
                                  <Import />
                                  Load
                                </span>
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </aside>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <ul className="m-features">
            <li>
              <p className="m-label">
                <History />
                Version history
              </p>
              <h3>Every save is a version</h3>
              <p>Compare any two, or load an older one back into the editor.</p>
            </li>
            <li>
              <p className="m-label">
                <GitCompare />
                Compare environments
              </p>
              <h3>Which keys each one sets</h3>
              <p>Development against production, names first, values on request.</p>
            </li>
            <li>
              <p className="m-label">
                <KeyRound />
                Find a key
              </p>
              <h3>One search, every file</h3>
              <p>&#8984;K finds a key across the workspace and the files missing it.</p>
            </li>
          </ul>
        </Reveal>
      </div>
    </section>
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
