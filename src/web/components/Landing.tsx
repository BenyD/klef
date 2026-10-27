import { useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { Check, ChevronRight, Copy, Search } from "lucide-react";
import { MarketingLayout } from "./MarketingLayout.tsx";
import { AgentPrompts } from "./AgentPrompts.tsx";
import { KlefMark } from "./KlefMark.tsx";
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

// A few pixel squares in the hero's dot grid, on the same 24px pitch, so the
// background reads as a surface rather than wallpaper. Fixed positions: the
// server and the browser draw the same field.
const PIXELS: { x: number; y: number; tone?: "ember" }[] = [
  { x: 2, y: 3 },
  { x: 3, y: 3 },
  { x: 3, y: 4, tone: "ember" },
  { x: 27, y: 1 },
  { x: 28, y: 1 },
  { x: 28, y: 2 },
  { x: 44, y: 14 },
  { x: 45, y: 14, tone: "ember" },
  { x: 45, y: 15 },
  { x: 12, y: 17 },
  { x: 13, y: 17 },
];

function Hero() {
  return (
    <section className="m-hero" aria-labelledby="hero-title">
      <div className="m-grid" aria-hidden="true">
        {PIXELS.map((p, i) => (
          <i
            key={i}
            className={p.tone === "ember" ? "m-px m-px-ember" : "m-px"}
            style={{ left: p.x * 24, top: p.y * 24 }}
          />
        ))}
      </div>

      <div className="m-wrap m-hero-grid">
        <div className="m-hero-copy">
          <p className="m-label m-eyebrow">
            <KlefMark className="m-eyebrow-mark" />
            Open source &middot; AGPL-3.0 &middot; Self-hostable
          </p>
          <h1 id="hero-title">
            Your .env files, in sync on every machine.{" "}
            <span className="m-nowrap">
              Readable only by <mark className="m-hl">you</mark>.
            </span>
          </h1>
          <p className="m-hero-lead">
            Klef keeps <code>.env.local</code> and <code>.env.production</code>{" "}
            the same everywhere you code. Files are sealed on your device, the
            server only ever holds ciphertext, and the CLI never prints a
            value, so Claude Code and Cursor can run it while you keep the key.
          </p>
          <div className="m-actions-row">
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

/**
 * The product, drawn small: the app's shell (canvas, sidebar, inset content
 * panel, 32px rows) with a file open, and the CLI's sync behind it. Values
 * are dots in the mock as they are in the app before unlock.
 */
function HeroStage() {
  return (
    <div className="m-stage" aria-hidden="true">
      <div className="m-shot m-shot-term">
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
      </div>

      <div className="m-shot m-app">
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
            <li className="m-app-file m-app-active">.env.production</li>
            <li>klef</li>
            <li>portfolio</li>
          </ul>
        </aside>
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
                <tr key={key} style={{ "--d": `${320 + r * 60}ms` } as CSSProperties}>
                  <td className="m-mono">{key}</td>
                  <td className="m-mono m-masked">{"•".repeat(n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="m-app-foot">9 variables &middot; 0 values shown</div>
        </div>
      </div>
    </div>
  );
}

function HowItWorks() {
  return (
    <section className="m-section" id="how-it-works" aria-labelledby="how-title">
      <div className="m-wrap">
        <div className="m-section-head">
          <div>
            <p className="m-label">How it works</p>
            <h2 id="how-title" className="m-h2">
              One command per repo.
              <br />
              One per new machine.
            </h2>
            <p className="m-lede">
              Setup links a checkout to its files and teaches your agents. Sync
              works out which side changed, and stops for you when both did.
            </p>
          </div>
          <Link to="/docs/quickstart" className="m-btn m-btn-soft">
            <Chev />
            Quickstart
          </Link>
        </div>
        <StepTabs />
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
          <div className="m-section-head">
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
          </div>

          <div className="m-band-grid">
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
          </div>

          <AgentPrompts />
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
      <div className="m-wrap m-closing-inner">
        <h2 id="closing-title" className="m-h2">
          Starting with Klef is simple, fast, and free.
        </h2>
        <p className="m-lede">
          Hosted at klef.sh with Google, GitHub or passkey sign-in, or on your
          own Cloudflare account. Either way, whoever runs the server cannot
          read your files.
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
      </div>
    </section>
  );
}
