import { useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { Check, Copy } from "lucide-react";
import { MarketingLayout } from "./MarketingLayout.tsx";
import { AgentPrompts, CopyPromptButton } from "./AgentPrompts.tsx";
import { Decrypt, StepTabs } from "./LandingTerminal.tsx";
import { DEFAULT_PROMPT } from "../lib/agent-prompts.ts";

// The landing page: six sections, and the detail lives on its own pages
// (/compare, /security, /docs). Every transcript is the CLI's real output and
// none shows a value, because the CLI never prints one. Motion is described
// in marketing.css; all of it is off under prefers-reduced-motion.

export function Landing() {
  return (
    <MarketingLayout>
      <main className="m-main">
        <Hero />
        <Marquee />
        <Statement />
        <HowItWorks />
        <Agents />
        <Closing />
      </main>
    </MarketingLayout>
  );
}

/**
 * Deterministic pseudo-random numbers, so the server and the browser draw the
 * same dot field and React has nothing to reconcile.
 */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const DOTS = (() => {
  const rnd = seeded(5);
  return Array.from({ length: 110 }, (_, i) => {
    const ember = i % 13 === 0;
    return {
      ember,
      style: {
        left: `${Math.floor(rnd() * 65) * 22 + 8}px`,
        top: `${Math.floor(rnd() * 28) * 22 + 8}px`,
        "--floor": ember ? 0.35 : 0.05,
        "--peak": ember ? 0.9 : Number((0.12 + rnd() * 0.25).toFixed(2)),
        "--dur": `${(6 + rnd() * 12).toFixed(1)}s`,
        "--delay": `-${(rnd() * 12).toFixed(1)}s`,
      } as CSSProperties,
    };
  });
})();

const VAULT_ROWS = ["DATABASE_URL", "STRIPE_KEY", "OPENAI_API_KEY", "SENTRY_DSN"];

function Hero() {
  return (
    <section className="m-hero" aria-labelledby="hero-title">
      <div className="m-field" aria-hidden="true">
        {DOTS.map((d, i) => (
          <span key={i} className={d.ember ? "m-dot m-dot-ember" : "m-dot"} style={d.style} />
        ))}
        <span className="m-walker" style={{ left: 1012, top: 66, "--dur": "9s" } as CSSProperties}>
          &#10033;
        </span>
        <span className="m-walker" style={{ left: 132, top: 506, "--dur": "12s" } as CSSProperties}>
          &#10033;
        </span>
      </div>

      <div className="m-wrap m-hero-grid">
        <div className="m-hero-copy">
          <p className="m-label m-kicker">
            <Decrypt text="End-to-end encrypted .env sync" delay={300} />
          </p>
          <h1 id="hero-title">
            Your{" "}
            <span className="m-nowrap">
              <span className="m-redact" style={{ "--d": "450ms" } as CSSProperties}>
                .env files
              </span>
              ,
            </span>{" "}
            in sync on every Mac. Readable only by{" "}
            <span className="m-nowrap">
              <span className="m-redact" style={{ "--d": "900ms" } as CSSProperties}>
                you
              </span>
              .
            </span>
          </h1>
          <p className="m-hero-lead">
            Klef keeps <code>.env.local</code> and <code>.env.production</code>{" "}
            the same everywhere you code, sealed on your device, through a CLI
            that never prints a value. Hand it to Claude Code or Cursor and
            keep the key yourself.
          </p>
          <div className="m-actions-row">
            <Link to="/auth" className="m-btn m-btn-ink">
              Get started free <span className="m-arrow" aria-hidden="true">&#8594;</span>
            </Link>
            <CopyPromptButton prompt={DEFAULT_PROMPT} className="m-btn m-btn-line">
              Copy the agent prompt
            </CopyPromptButton>
          </div>
        </div>

        <div className="m-stack" aria-hidden="true">
          <div className="m-card m-card-back">
            <div className="m-tabs">
              <span className="m-swatch" style={{ background: "var(--m-fg)" }} />
              <b>Audit</b>
              <span>Vercel</span>
              <span>GitHub</span>
              <span>Cloudflare</span>
            </div>
          </div>
          <div className="m-card m-card-mid">
            <div className="m-tabs">
              <span className="m-swatch" style={{ background: "var(--m-ok)" }} />
              <b>Agents</b>
              <span>Claude Code</span>
              <span>Cursor</span>
            </div>
          </div>
          <div className="m-card m-card-front">
            <div className="m-tabs">
              <span className="m-swatch" />
              <b>Vault</b>
              <span className="m-mono">.env.local</span>
              <span className="m-mono">.env.production</span>
              <span className="m-mono m-end">0 values shown</span>
            </div>
            <table className="m-vault">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Value</th>
                  <th>MacBook</th>
                  <th>Mac mini</th>
                  <th>New Mac</th>
                </tr>
              </thead>
              <tbody>
                {VAULT_ROWS.map((key, r) => (
                  <tr key={key} style={{ "--d": `${250 + r * 70}ms` } as CSSProperties}>
                    <td className="m-mono">{key}</td>
                    <td className="m-mono m-masked">&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;</td>
                    {[0, 1, 2].map((c) => (
                      <td key={c}>
                        <span
                          className="m-chk"
                          style={{ "--d": `${(c === 2 ? 1300 : 500 + c * 60) + r * 60}ms` } as CSSProperties}
                        >
                          &#10003;
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="m-card-foot">
              $ klef restore ~/Developer &#160;<span className="t-ok">Wrote 14 variables to .env.local</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const MARQUEE = [
  "klef setup",
  "klef sync",
  "klef restore",
  "klef audit",
  "AES-256-GCM",
  "Argon2id",
  "0 values printed",
  "AGPL-3.0",
  "Self-host on Cloudflare",
];

function Marquee() {
  // Two copies, so translating by half loops seamlessly. Only the first copy
  // is read out.
  return (
    <section className="m-marquee" aria-label="At a glance">
      <div className="m-marquee-track">
        {[0, 1].map((copy) =>
          MARQUEE.map((item) => (
            <span key={`${copy}-${item}`} aria-hidden={copy === 1 ? true : undefined} style={{ display: "contents" }}>
              <span>{item}</span>
              <i aria-hidden="true">&#10033;</i>
            </span>
          )),
        )}
      </div>
    </section>
  );
}

function Statement() {
  return (
    <section className="m-section">
      <div className="m-wrap m-statement">
        <figure className="m-editor" style={{ margin: 0 }}>
          <figcaption className="m-editor-bar">
            <span className="m-swatch" />
            .env.production
          </figcaption>
          <div className="m-editor-body">
            <div className="m-editor-gutter" aria-hidden="true">
              1<br />2<br />3<br />4
            </div>
            <pre className="m-editor-code">
              <span className="m-comment"># The end-to-end encrypted way</span>
              {"\n"}
              <span className="m-comment"># to keep .env files in sync.</span>
              {"\n\n"}
              YOUR_SECRETS<span className="m-comment">=</span>
              <span className="m-masked" aria-label="hidden value">
                &#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;
              </span>
              <span className="m-caret" aria-hidden="true" />
            </pre>
          </div>
        </figure>
        <p className="m-lede" style={{ fontSize: 18, textAlign: "center" }}>
          Sealed on your device, synced through a server that only ever holds
          ciphertext, and opened on your next Mac with one command.{" "}
          <Link to="/security" style={{ color: "var(--m-fg)", textDecoration: "underline", textUnderlineOffset: 3 }}>
            How the encryption works
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="m-section" id="how-it-works" aria-labelledby="how-title" style={{ paddingTop: 0 }}>
      <div className="m-wrap">
        <div className="m-section-head">
          <div>
            <h2 id="how-title" className="m-h2">
              <span className="m-redact" style={{ "--d": "200ms" } as CSSProperties}>
                How it works
              </span>
            </h2>
            <p className="m-lede">
              One command per repo, one per new machine. Sync works out which
              side changed, and stops for you when both did.
            </p>
          </div>
          <Link to="/docs" className="m-btn m-btn-line">
            Read the docs <span className="m-arrow" aria-hidden="true">&#8594;</span>
          </Link>
        </div>
        <StepTabs />
      </div>
    </section>
  );
}

/** Rows of dots that grow until they become the dark band. */
function Halftone({ flip }: { flip?: boolean }) {
  const cols = 48;
  const rows = [
    (x: number) => 2 + 6 * x,
    (x: number) => 8 + 14 * x,
  ];
  const ordered = flip ? [...rows].reverse() : rows;
  return (
    <div className="m-halftone" aria-hidden="true" style={{ "--cols": cols } as CSSProperties}>
      {ordered.map((size, r) =>
        Array.from({ length: cols }, (_, c) => {
          const px = Math.round(size(c / (cols - 1)));
          return (
            <span key={`${r}-${c}`}>
              <i style={{ width: px, height: px }} />
            </span>
          );
        }),
      )}
    </div>
  );
}

function Agents() {
  return (
    <>
      <Halftone />
      <section className="m-dark" id="agents" aria-labelledby="agents-title">
        <div className="m-wrap">
          <div className="m-section-head" style={{ marginBottom: 0 }}>
            <h2 id="agents-title" className="m-h2" style={{ margin: 0 }}>
              Agents never see your secrets.
              <br />
              <span className="m-dark-quiet">Your agent runs Klef. You hold the key.</span>
            </h2>
          </div>

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
              <p className="m-label">
                <Decrypt text="Never printed" delay={200} />
              </p>
              <h3>No value, ever</h3>
              <p>
                There is no <code>klef get</code> and no <code>--print</code>. Pull
                writes the file at mode 0600 and reports a count.
              </p>
            </li>
            <li>
              <p className="m-label">
                <Decrypt text="Passphrase" delay={350} />
              </p>
              <h3>Your terminal only</h3>
              <p>
                The CLI reads it from your terminal, never from stdin, a flag or
                the agent driving it.
              </p>
            </li>
            <li>
              <p className="m-label">
                <Decrypt text="Setup" delay={500} />
              </p>
              <h3>Taught once</h3>
              <p>
                Setup writes a Claude Code skill and a Cursor rule into the repo,
                so every new session already knows how to sync.
              </p>
            </li>
          </ul>

          <AgentPrompts />
        </div>
      </section>
      <Halftone flip />
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
      <button type="button" className="m-btn m-btn-sm m-btn-ink" onClick={() => void copy()} aria-label="Copy the setup command">
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

function Closing() {
  return (
    <section className="m-section" id="start" aria-labelledby="closing-title">
      <div className="m-wrap">
        <div className="m-grain m-cta">
          <div className="m-cta-copy">
            <p className="m-label">Get started</p>
            <h2 id="closing-title">Your next Mac is one command away.</h2>
            <p>
              Put your env files in Klef today, and the next laptop, reinstall
              or new repo takes one command instead of an afternoon.
            </p>
            <CopyCommand />
            <p className="m-checks">
              <span>&#10003; No card</span>
              <span>&#10003; No tracking</span>
              <span>&#10003; Export any time</span>
            </p>
          </div>
          <div className="m-paths">
            <Link to="/auth" className="m-path m-path-ink">
              <span className="m-path-top">
                <b>Use klef.sh</b>
                <span className="m-btn m-btn-sm m-btn-ember">
                  Get started free <span className="m-arrow" aria-hidden="true">&#8594;</span>
                </span>
              </span>
              <span>
                Hosted for you, free. Sign in with Google, GitHub or a passkey
                and your vault is ready in a minute.
              </span>
            </Link>
            <a
              href="https://github.com/BenyD/klef#self-hosting"
              target="_blank"
              rel="noreferrer"
              className="m-path"
            >
              <span className="m-path-top">
                <b>Run your own</b>
                <span className="m-btn m-btn-sm m-btn-line">
                  Self-host guide <span className="m-arrow" aria-hidden="true">&#8594;</span>
                </span>
              </span>
              <span>
                AGPL-3.0 on your Cloudflare account with Workers and D1. The same
                encryption, on a server you own.
              </span>
            </a>
            <p style={{ margin: "6px 0 0", fontSize: 13 }}>
              Either way, whoever runs the server cannot read your files.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
