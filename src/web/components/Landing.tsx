import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";
import { Check, ChevronRight, Copy, Search } from "lucide-react";
import { MarketingLayout } from "./MarketingLayout.tsx";
import { AgentPrompts } from "./AgentPrompts.tsx";
import { KlefMark } from "./KlefMark.tsx";
import { PixelField } from "./PixelField.tsx";
import { Reveal } from "./Reveal.tsx";
import { Cmd, Out, StepTabs, Yes } from "./LandingTerminal.tsx";

// The landing page: a hero, two sections and a closing line. The detail
// lives on its own pages (/compare, /security, /docs). Every transcript is
// the CLI's real output and none shows a value, because the CLI never prints
// one. The page is prerendered, so nothing here touches a browser API at
// render time.

const GITHUB = "https://github.com/BenyD/klef";

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

/** A leading chevron, the way every button and text link here points. */
export function Chev() {
  return <ChevronRight className="m-chev" aria-hidden="true" />;
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
            Open source &middot; AGPL-3.0 &middot; Self-hostable
          </p>
          <h1 id="hero-title" className="m-beat">
            Your .env files, in sync on every machine.{" "}
            <span className="m-nowrap">
              Readable only by <mark className="m-hl">you</mark>.
            </span>
          </h1>
          <p className="m-hero-lead m-beat">
            Klef keeps <code>.env.local</code> and <code>.env.production</code>{" "}
            the same on every machine. Encrypted on your device, synced by a
            CLI that never prints a value, so your coding agents can run it.
          </p>
          <div className="m-actions-row m-beat">
            <Link to="/auth" className="m-btn m-btn-ink">
              <Chev />
              Get started free
            </Link>
            <Link to="/docs" className="m-btn m-btn-soft">
              <Chev />
              Read the docs
            </Link>
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

/** Which keys each file defines, for the comparison card. */
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
          <Out>
            Push .env.local? [y/N] <Yes />
          </Out>
          <Out tone="ok">Pushed 14 variables (+1 lines) to .env.local</Out>
          <Out tone="ok">Wrote 9 variables to .env.production</Out>
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

function Sidebar({ active }: { active: "production" | "compare" }) {
  return (
    <aside className="m-app-side">
      <div className="m-app-ws">
        <KlefMark accent="var(--m-accent)" />
        <b>personal</b>
      </div>
      <div className="m-app-search">
        <Search />
        Search
        <kbd>&#8984;K</kbd>
      </div>
      <p className="m-label">Projects</p>
      <ul className="m-app-tree">
        <li className="m-app-open">lensdrop</li>
        <li className="m-app-file">.env.local</li>
        <li className={active === "production" ? "m-app-file m-app-active" : "m-app-file"}>.env.production</li>
        <li>klef</li>
        <li>portfolio</li>
      </ul>
    </aside>
  );
}

function VaultCard() {
  return (
    <>
      <Sidebar active="production" />
      <div className="m-app-panel">
        <div className="m-app-head">
          <span>lensdrop</span>
          <span className="m-app-sep">/</span>
          <b>.env.production</b>
          <span className="m-app-status">Synced</span>
        </div>
        <table className="m-vault">
          <thead>
            <tr>
              <th>Key</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {VAULT_ROWS.map(([key, n], r) => (
              <tr key={key} style={{ "--d": `${120 + r * 60}ms` } as CSSProperties}>
                <td className="m-mono">{key}</td>
                <td className="m-mono m-masked">{"\u2022".repeat(n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="m-app-foot">9 variables &middot; 0 values shown</div>
      </div>
    </>
  );
}

function CompareCard() {
  return (
    <>
      <Sidebar active="compare" />
      <div className="m-app-panel">
        <div className="m-app-head">
          <span>lensdrop</span>
          <span className="m-app-sep">/</span>
          <b>Compare</b>
          <span className="m-app-status m-app-status-quiet">Names only</span>
        </div>
        <table className="m-vault m-compare">
          <thead>
            <tr>
              <th>Key</th>
              <th>local</th>
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
        <div className="m-app-foot">2 keys differ &middot; 0 values shown</div>
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
              changed, and stops for you when both did.
            </p>
          </div>
          <Link to="/docs/quickstart" className="m-btn m-btn-soft">
            <Chev />
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
              <Chev />
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
                  There is no <code>klef get</code> and no <code>--print</code>. Pull
                  writes the file at mode 0600 and reports a count.
                </p>
              </li>
              <li>
                <p className="m-label">Passphrase</p>
                <h3>Your terminal only</h3>
                <p>
                  The CLI reads it from your terminal, never from stdin, a flag or
                  the agent driving it.
                </p>
              </li>
              <li>
                <p className="m-label">Setup</p>
                <h3>Taught once</h3>
                <p>
                  Setup writes a Claude Code skill and a Cursor rule into the repo,
                  so every new session already knows how to sync.
                </p>
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
      <button type="button" className="m-cmd-copy" onClick={() => void copy()} aria-label="Copy the setup command">
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy"}
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
            <Chev />
            Get started free
          </Link>
          <a href={`${GITHUB}#self-hosting`} target="_blank" rel="noreferrer" className="m-btn m-btn-soft">
            <Chev />
            Self-host guide
          </a>
        </div>
        <CopyCommand />
      </Reveal>
    </section>
  );
}
