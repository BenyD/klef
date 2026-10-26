import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { MarketingLayout } from "./MarketingLayout.tsx";
import { AgentPrompts, CopyPromptButton } from "./AgentPrompts.tsx";
import { CommandTable, Cmd, Out, Transcript, Yes } from "./LandingTerminal.tsx";
import { SecurityBoundary } from "./SecurityBoundary.tsx";
import { DEFAULT_PROMPT } from "../lib/agent-prompts.ts";

// The landing page. Every section is a heading block and one card (see the
// header of marketing.css). Every transcript is the CLI's real output, and
// none shows a value, because the CLI never prints one.

export function Landing() {
  return (
    <MarketingLayout>
      <main className="m-main">
        <Hero />
        <HowItWorks />
        <Cli />
        <Agents />
        <SecurityModel />
        <Compare />
        <Faq />
        <Closing />
      </main>
    </MarketingLayout>
  );
}

function Hero() {
  return (
    <section className="m-hero m-wrap" aria-labelledby="hero-title">
      <div className="m-card">
        <div className="m-panel m-hero-panel">
          <div className="m-hero-copy">
            <p className="m-kicker">
              <span className="m-dot" aria-hidden="true" />
              End-to-end encrypted .env sync, built for Claude Code and Cursor
            </p>
            <h1 id="hero-title">
              <span className="m-phrase">Every .env file,</span>{" "}
              <span className="m-phrase">on every machine.</span>{" "}
              <span className="m-quiet m-phrase">Readable only by you.</span>
            </h1>
            <p className="m-hero-lead">
              Klef keeps <code>.env.local</code> and <code>.env.production</code>{" "}
              in sync across your Macs. Files are sealed on your device before
              they leave it, and the CLI never prints a value, so your coding
              agent can run it for you.
            </p>
            <div className="m-hero-actions">
              <Link to="/auth" className="m-btn m-btn-primary">
                Get started free
              </Link>
              <CopyPromptButton prompt={DEFAULT_PROMPT} className="m-btn m-btn-outline">
                Copy the agent prompt
              </CopyPromptButton>
            </div>
            <p className="m-hero-note">
              Free. Open source under AGPL-3.0. Self-host it on your own
              Cloudflare account.
            </p>
          </div>

          <Figure />
        </div>

        <dl className="m-stats">
          <Stat value="AES-256-GCM" label="Encrypted on your device, before upload" />
          <Stat value="0 values" label="Printed by the CLI, by design" />
          <Stat value="$0" label="Free on klef.sh, or self-host it" />
        </dl>
      </div>
    </section>
  );
}

/** Fig. 1: where a file goes, and the only form in which it travels. */
function Figure() {
  return (
    <figure className="m-fig" style={{ margin: 0 }}>
      <div className="m-fig-row">
        <div className="m-node">
          <span className="m-node-label">Your laptop</span>
          <span className="m-node-key">.env.local</span>
          <span className="m-node-val">DATABASE_URL=&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;</span>
          <span className="m-node-val">STRIPE_KEY=&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;</span>
        </div>
        <div className="m-edge" aria-hidden="true">
          <b>AES-256-GCM</b>
          <i />
          <span>sealed here</span>
        </div>
        <div className="m-node m-node-vault">
          <span className="m-node-label">Klef vault</span>
          <span className="m-node-val">9f2kQx0mL1vB7sTn4wE8&#8230;</span>
          <span className="m-node-val">Zp3uRc6yH0aK5dJq2gW1&#8230;</span>
          <span className="m-node-ok">Ciphertext only</span>
        </div>
        <div className="m-edge" aria-hidden="true">
          <b>klef restore</b>
          <i />
          <span>opened there</span>
        </div>
        <div className="m-node">
          <span className="m-node-label">Your new Mac</span>
          <span className="m-node-key">.env.local</span>
          <span className="m-node-key">.env.production</span>
          <span className="m-node-val">Back on disk, mode 0600</span>
        </div>
      </div>
      <figcaption className="m-caption">
        <b>Fig. 1</b>
        Files are sealed with AES-256-GCM on your device and opened with{" "}
        <code className="m-code">klef restore</code> on the next. The server
        only ever holds what it cannot read.
      </figcaption>
    </figure>
  );
}

function HowItWorks() {
  return (
    <section className="m-section" id="how-it-works" aria-labelledby="how-title">
      <div className="m-wrap">
        <SectionHead
          id="how-title"
          n="01"
          kicker="How it works"
          title="One command per repo. One per new machine."
          lead="Link a repo once and its env files follow you. Sync works out which side changed, and stops for you when both did."
        />
        <ol className="m-card m-steps">
          <Step n="1" title="Connect a repo" body="Signs this machine in, links the repo, teaches your agents, and pulls the files that are missing. Rerun it any time: it skips what is done.">
            <Cmd>npx @klefsh/cli setup</Cmd>
            <Out>Step 1 of 4: signed in as you@example.com.</Out>
            <Out>Step 2 of 4: linked to personal / lensdrop (2 files).</Out>
            <Out>Step 3 of 4: instructions for Claude Code and Cursor.</Out>
            <Out>Step 4 of 4: pull .env.local, .env.production.</Out>
          </Step>
          <Step n="2" title="Keep it in sync" body="Pushes what you edited and pulls what changed in the vault. If a file changed on both sides, it shows which keys differ and writes nothing.">
            <Cmd>klef sync</Cmd>
            <Out>.env.local       in sync</Out>
            <Out>.env.production  changed in the vault</Out>
            <Out tone="ok">Wrote 9 variables to .env.production</Out>
          </Step>
          <Step n="3" title="Restore a new Mac" body="Clone your repos, point restore at the folder, and confirm once. It asks before it decrypts anything, and only ever pulls.">
            <Cmd>klef restore ~/Developer</Cmd>
            <Out>Linked checkouts under /Users/you/Developer:</Out>
            <Out>  lensdrop  personal / lensdrop  (.env.local, .env.production)</Out>
            <Out>
              Restore these 2? [y/N] <Yes />
            </Out>
          </Step>
        </ol>
      </div>
    </section>
  );
}

function Cli() {
  return (
    <section className="m-section m-band" id="cli" aria-labelledby="cli-title">
      <div className="m-wrap">
        <SectionHead
          id="cli-title"
          n="02"
          kicker="The CLI"
          title="Short commands. Not one of them prints a secret."
          lead={
            <>
              There is no <code>klef get</code> and no <code>--print</code>.
              Commands report counts and key names, and the passphrase is read
              from your terminal, never from a flag or stdin.
            </>
          }
        />
        <div className="m-card">
          <CommandTable />
          <div className="m-card-foot">
            <span>
              Install it once: <code className="m-code">npm install -g @klefsh/cli</code>
            </span>
            <Link to="/docs" className="m-link">
              Every command and flag
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Agents() {
  return (
    <section className="m-section" id="agents" aria-labelledby="agents-title">
      <div className="m-wrap">
        <SectionHead
          id="agents-title"
          n="03"
          kicker="For your agent"
          title="Your agent runs it. You hold the key."
          lead="Setup writes a Claude Code skill and a Cursor rule into the repo, so every new session already knows how to sync. When the vault is locked, the CLI hands the passphrase back to you."
        />
        <div className="m-card">
          <div className="m-card-head">
            <span className="m-card-title">A Claude Code session in ~/Developer/lensdrop</span>
            <span style={{ display: "flex", gap: 6 }}>
              <span className="m-tag">
                <span className="m-dot" aria-hidden="true" />
                Claude Code
              </span>
              <span className="m-tag">
                <span className="m-dot" style={{ background: "var(--m-fg)" }} aria-hidden="true" />
                Cursor
              </span>
            </span>
          </div>
          <AgentSession />
          <dl className="m-stats">
            <Stat value="Never printed" label="No command prints a value, and errors are redacted too" />
            <Stat value="Your terminal" label="The only place the passphrase is typed" />
            <Stat value="Inside the repo" label="Where pull and push are allowed to write" />
          </dl>
          <div className="m-card-foot">
            <span>
              Setup writes <code className="m-code">.claude/skills/klef/SKILL.md</code> and{" "}
              <code className="m-code">.cursor/rules/klef.mdc</code>. Both are safe to commit.
            </span>
          </div>
        </div>
        <AgentPrompts />
      </div>
    </section>
  );
}

/**
 * A Claude Code session, drawn rather than screenshotted. The CLI lines are
 * verbatim (the no-terminal error is NoTerminalError in src/cli/prompt.ts);
 * the agent's own sentences are illustrative.
 */
function AgentSession() {
  return (
    <div className="m-panel m-session">
      <p className="m-you">
        <span aria-hidden="true">&gt; </span>
        <span className="m-sr">You: </span>
        pull the latest env files
      </p>
      <div className="m-tool">
        <p className="m-call">
          <span className="m-dot" aria-hidden="true" />
          <span>Bash(klef sync)</span>
        </p>
        <p className="m-tool-out">
          This needs an interactive terminal. Run it yourself rather than
          through a script or agent.
        </p>
      </div>
      <p className="m-says">
        <span className="m-dot" aria-hidden="true" />
        <span>
          The vault is locked, and only you can type the passphrase. Run{" "}
          <code>klef unlock</code> in your own terminal and tell me when it is
          done.
        </span>
      </p>
      <p className="m-you">
        <span aria-hidden="true">&gt; </span>
        <span className="m-sr">You: </span>
        done
      </p>
      <div className="m-tool">
        <p className="m-call">
          <span className="m-dot" aria-hidden="true" />
          <span>Bash(klef sync)</span>
        </p>
        <p className="m-tool-out">
          .env.local in sync
          <br />
          .env.production changed in the vault
          <br />
          <span className="t-ok">Wrote 9 variables to .env.production</span>
        </p>
      </div>
      <p className="m-says">
        <span className="m-dot" aria-hidden="true" />
        <span>Pulled .env.production from the vault. .env.local was already up to date.</span>
      </p>
    </div>
  );
}

function SecurityModel() {
  return (
    <section className="m-section m-band" id="security" aria-labelledby="security-title">
      <div className="m-wrap">
        <SectionHead
          id="security-title"
          n="04"
          kicker="Security model"
          title="Encryption happens on your side of the line."
          lead="Your passphrase becomes a key on your device. The server stores what it needs to sync, and nothing that can decrypt it."
        />
        <div className="m-card">
          <SecurityBoundary />
          <dl className="m-stats m-stats-4">
            <Stat value="30 days" label="Signed in with Google, GitHub or a passkey" />
            <Stat value="15 minutes" label="Idle before the vault locks, unless you choose longer" />
            <Stat value="Once" label="The recovery key is shown. Klef cannot reset it." />
            <Stat value="AGPL-3.0" label="Read the crypto, or self-host to pin it" />
          </dl>
          <div className="m-card-foot">
            <span>Signing in gets you ciphertext and names. Decrypting needs your passphrase.</span>
            <Link to="/security" className="m-link">
              Read the security model
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// Category-level and checkable on purpose: no competitor is named, and every
// cell is a property of the kind of tool, including the rows Klef loses.
const COMPARE_COLUMNS = [
  "Klef",
  "Hosted secrets managers",
  "Encrypted .env in git",
  "Pasting into chat",
] as const;

const COMPARE_ROWS: { label: string; cells: [string, string, string, string] }[] = [
  {
    label: "Who can decrypt",
    cells: ["Only your devices", "The provider's servers", "Whoever holds the private key", "Anyone who can read it"],
  },
  {
    label: "Setup for one developer",
    cells: ["One command per repo", "Workspace, projects, tokens", "A key to place per environment", "None"],
  },
  {
    label: "Safe to hand to an agent",
    cells: ["The CLI never prints a value", "Their CLIs can print values", "The key decrypts everything", "No"],
  },
  {
    label: "Teams, CI injection, rotation",
    cells: ["No, by design", "Yes", "CI, through the key", "No"],
  },
  {
    label: "Cost",
    cells: ["Free, or self-host", "Free tiers, then per seat", "Free and open source", "Free"],
  },
];

function Compare() {
  return (
    <section className="m-section" id="compare" aria-labelledby="compare-title">
      <div className="m-wrap">
        <SectionHead
          id="compare-title"
          n="05"
          kicker="Compared"
          title="Built for one developer, not a platform team."
          lead="If you need secrets injected into CI, rotated and shared across a team, a hosted secrets manager is the right tool. Klef gives that up so its server can never read your files."
        />
        <div className="m-card">
          <div className="m-panel m-table-wrap">
            <table className="m-table">
              <thead>
                <tr>
                  <td />
                  {COMPARE_COLUMNS.map((c, i) => (
                    <th key={c} scope="col" className={i === 0 ? "m-us" : undefined}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {row.cells.map((cell, i) => (
                      <td key={i} className={i === 0 ? "m-us" : undefined}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Why not Doppler or Infisical?",
    a: (
      <>
        They are team products that serve secrets to CI and production, which
        means their servers can decrypt them. Klef trades that away: it is for
        one developer with a few machines, and its server cannot read a value.
      </>
    ),
  },
  {
    q: "What can my coding agent see?",
    a: (
      <>
        Through Klef, key names and counts, never values. Once{" "}
        <code>pull</code> writes a file, it is an ordinary file on your disk
        that any process running as you could open. The skill and rule that
        setup installs tell your agent not to.
      </>
    ),
  },
  {
    q: "What if I forget my passphrase?",
    a: (
      <>
        Use the recovery key Klef showed you once at setup. If you lose both,
        the data cannot be recovered by anyone, including Klef. That is what
        end-to-end encryption means.
      </>
    ),
  },
  {
    q: "What does the server store?",
    a: (
      <>
        Your account, the names of your workspaces, projects and files, a
        wrapped copy of your key, and ciphertext. Key names inside your files
        are encrypted with the values. <Link to="/security">The details</Link>.
      </>
    ),
  },
  {
    q: "What do I need to run the CLI?",
    a: (
      <>
        Node 22.18 or later. Run <code>npx @klefsh/cli setup</code> in a repo,
        or install it with <code>npm install -g @klefsh/cli</code> to get a{" "}
        <code>klef</code> command. It runs on macOS, Linux and Windows, though
        on Windows <code>klef unlock</code> is not available yet, so each
        command asks for the passphrase.
      </>
    ),
  },
  {
    q: "What if klef.sh goes away?",
    a: (
      <>
        Export any file from the app at any time, or run your own copy. Klef is
        AGPL-3.0 and deploys to your Cloudflare account with Workers and D1.
      </>
    ),
  },
  {
    q: "Is it for teams?",
    a: (
      <>
        No. A vault belongs to one person. Workspaces are for keeping projects
        apart, not for sharing them.
      </>
    ),
  },
  {
    q: "Is it really free?",
    a: (
      <>
        Yes. There is no paid plan, no tracking and no ads. If you would rather
        not depend on klef.sh, self-host it.
      </>
    ),
  },
];

function Faq() {
  return (
    <section className="m-section m-band" id="faq" aria-labelledby="faq-title">
      <div className="m-wrap m-faq">
        <SectionHead
          id="faq-title"
          n="06"
          kicker="Questions"
          title="The honest answers."
          lead="Anything else is in the docs, or ask on GitHub."
        />
        <div className="m-card">
          <div className="m-panel">
            {FAQ.map((item, i) => (
              <details key={item.q} className="m-faq-item" open={i === 0}>
                <summary>
                  {item.q}
                  <span className="m-faq-icon" aria-hidden="true" />
                </summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="m-section" aria-labelledby="closing-title">
      <div className="m-wrap">
        <div className="m-card">
          <div className="m-panel m-closing-panel">
            <h2 id="closing-title" className="m-h2">
              Stop sending yourself <span className="m-nowrap">.env files.</span>
            </h2>
            <p className="m-lede">
              Free on klef.sh, or on your own Cloudflare account. Either way,
              whoever runs the server cannot read your files.
            </p>
            <div className="m-hero-actions">
              <Link to="/auth" className="m-btn m-btn-primary">
                Get started free
              </Link>
              <a
                href="https://github.com/BenyD/klef#self-hosting"
                target="_blank"
                rel="noreferrer"
                className="m-btn m-btn-outline"
              >
                Self-host it
              </a>
            </div>
            <p className="m-hero-note">
              Or in a repo: <code>npx @klefsh/cli setup</code>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHead({
  id,
  n,
  kicker,
  title,
  lead,
}: {
  id: string;
  n: string;
  kicker: string;
  title: string;
  lead?: ReactNode;
}) {
  return (
    <header className="m-head">
      <p className="m-eyebrow">
        <b>{n}</b>
        {kicker}
      </p>
      <h2 id={id} className="m-h2">
        {title}
      </h2>
      {lead && <p className="m-lede">{lead}</p>}
    </header>
  );
}

function Step({
  n,
  title,
  body,
  children,
}: {
  n: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <li className="m-panel m-step">
      <h3 className="m-tag" style={{ alignSelf: "flex-start" }}>
        <span className="m-step-n">{n}</span>
        {title}
      </h3>
      <p>{body}</p>
      <Transcript>{children}</Transcript>
    </li>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  // dt before dd in the markup, so a screen reader hears the term first; the
  // tile shows the value on top (column-reverse in marketing.css).
  return (
    <div className="m-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
