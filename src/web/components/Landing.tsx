import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { MarketingLayout, GitHubIcon } from "./MarketingLayout.tsx";
import { AgentPrompts } from "./AgentPrompts.tsx";
import { Cmd, Out, Terminal, TerminalDemo, Yes } from "./LandingTerminal.tsx";
import { SecurityBoundary } from "./SecurityBoundary.tsx";

// Every transcript on this page is what the CLI actually prints (see
// src/cli/commands and src/cli/output.ts), down to the wording. None of them
// shows a value, because the CLI never prints one: that is the point the
// page is making, so a made-up line with a secret in it would undercut it.

export function Landing() {
  return (
    <MarketingLayout>
      <main className="marketing-main">
        <Hero />
        <HowItWorks />
        <Agents />
        <SecurityModel />
        <Audit />
        <Compare />
        <Faq />
        <Closing />
      </main>
    </MarketingLayout>
  );
}

function Hero() {
  return (
    <section className="m-hero" aria-labelledby="hero-title">
      <div className="m-hero-head">
        <p className="m-eyebrow">
          <span className="m-eyebrow-dot" aria-hidden="true" />
          End-to-end encrypted. Built for Claude Code and Cursor.
        </p>
        <h1 id="hero-title">
          <span className="m-phrase">Every .env file,</span>{" "}
          <span className="m-phrase">on every machine.</span>{" "}
          <span className="m-h1-quiet m-phrase">Readable only by you.</span>
        </h1>
        <p className="m-hero-lead">
          Klef keeps <code>.env.local</code> and <code>.env.production</code>{" "}
          in sync across your Macs. Files are encrypted on your device before
          they leave it, and the CLI never prints a value, so your coding agent
          can run it for you.
        </p>
        <div className="m-hero-actions">
          <Link to="/auth" className="m-btn m-btn-primary m-btn-lg">
            Get started free
          </Link>
          <a href="#how-it-works" className="m-link-quiet">
            See how it works
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>

      <div className="m-hero-visual">
        <TerminalDemo />
      </div>

      <ProofBar />
    </section>
  );
}

// Verifiable facts in place of a logo strip: Klef has no customer logos, and
// each of these can be checked in the source or on /security.
function ProofBar() {
  return (
    <ul className="m-proof" aria-label="At a glance">
      <li>
        <span className="m-proof-k">AES-256-GCM</span>
        <span className="m-proof-v">Encrypted on your device</span>
      </li>
      <li>
        <span className="m-proof-k">Argon2id</span>
        <span className="m-proof-v">Your passphrase never leaves it</span>
      </li>
      <li>
        <span className="m-proof-k">0 values</span>
        <span className="m-proof-v">Printed by the CLI, by design</span>
      </li>
      <li>
        <span className="m-proof-k">AGPL-3.0</span>
        <span className="m-proof-v">Open source, self-host on Cloudflare</span>
      </li>
    </ul>
  );
}

function HowItWorks() {
  return (
    <section className="m-section" id="how-it-works" aria-labelledby="how-title">
      <SectionHead
        id="how-title"
        n="01"
        kicker="How it works"
        title="Three commands. Every machine."
        lead="Link a repo once and its env files follow you. Sync works out which side changed, and stops for you when both did."
      />

      <ol className="m-steps">
        <Step
          n="1"
          title="Connect a repo"
          body="Signs this machine in, links the repo to a project in your vault, teaches your agents, and pulls the files that are missing. Rerun it any time: it skips what is done."
        >
          <Cmd>npx @klefsh/cli setup</Cmd>
          <Out>Step 1 of 4: signed in as you@example.com.</Out>
          <Out>Step 2 of 4: linked to personal / lensdrop (2 files).</Out>
          <Out>Step 3 of 4: instructions for Claude Code and Cursor.</Out>
          <Out>Step 4 of 4: pull .env.local, .env.production.</Out>
        </Step>
        <Step
          n="2"
          title="Keep it in sync"
          body="Pushes what you edited here and pulls what changed in the vault. If a file changed on both sides, it shows which keys differ and writes nothing."
        >
          <Cmd>klef sync</Cmd>
          <Out>.env.local       in sync</Out>
          <Out>.env.production  changed in the vault</Out>
          <Out tone="ok">Wrote 9 variables to .env.production</Out>
        </Step>
        <Step
          n="3"
          title="Restore a new Mac"
          body="Clone your repos and point restore at the folder. It lists every linked checkout, asks before it decrypts anything, and only ever pulls."
        >
          <Cmd>klef restore ~/Developer</Cmd>
          <Out>Linked checkouts under /Users/you/Developer:</Out>
          <Out>  lensdrop  personal / lensdrop  (.env.local, .env.production)</Out>
          <Out>
            Restore these 2? [y/N] <Yes />
          </Out>
        </Step>
      </ol>
    </section>
  );
}

function Agents() {
  return (
    <section className="m-section" id="agents" aria-labelledby="agents-title">
      <SectionHead
        id="agents-title"
        n="02"
        kicker="For your agent"
        title="Your agent runs it. You hold the key."
        lead="Setup writes a Claude Code skill and a Cursor rule into the repo, so every new session already knows how to sync, and that it must never print a value. When the vault is locked, the CLI hands the passphrase back to you."
      />

      <div className="m-agent-grid">
        <AgentSession />

        <ul className="m-facts">
          <Fact title="It never prints a secret">
            There is no <code>klef get</code> and no <code>--print</code>.{" "}
            <code>pull</code> writes the file at mode 0600 and reports a count.{" "}
            <code>diff</code> and <code>sync</code> name keys, never values.
          </Fact>
          <Fact title="Your agent never sees the passphrase">
            The CLI reads it from your terminal, never from stdin, a flag, or an
            environment variable. <code>klef unlock</code> covers the next
            commands and locks after 15 idle minutes.
          </Fact>
          <Fact title="It stays inside the repo">
            <code>pull</code> and <code>push</code> refuse absolute paths and{" "}
            <code>../</code>, so an agent cannot choose where plaintext lands.
          </Fact>
        </ul>
      </div>

      <AgentPrompts />
    </section>
  );
}

/**
 * A Claude Code session, drawn rather than screenshotted. The CLI lines are
 * verbatim (the no-terminal error is NoTerminalError in src/cli/prompt.ts);
 * the agent's own sentences are illustrative and say so by their styling.
 */
function AgentSession() {
  return (
    <figure className="m-session">
      <figcaption className="m-term-bar">
        <span className="m-term-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="m-term-title">claude: ~/Developer/lensdrop</span>
      </figcaption>
      <div className="m-session-body">
        <p className="m-session-you">
          <span className="m-session-mark" aria-hidden="true">&gt;</span>
          <span>
            <span className="m-sr">You: </span>
            pull the latest env files
          </span>
        </p>
        <div className="m-session-tool">
          <p className="m-session-call">
            <span className="m-session-dot" aria-hidden="true" />
            Bash(klef sync)
          </p>
          <p className="m-session-out">
            This needs an interactive terminal. Run it yourself rather than
            through a script or agent.
          </p>
        </div>
        <p className="m-session-agent">
          <span className="m-session-dot" aria-hidden="true" />
          <span>
            The vault is locked, and only you can type the passphrase. Run{" "}
            <code>klef unlock</code> in your own terminal and tell me when it
            is done.
          </span>
        </p>
        <p className="m-session-you">
          <span className="m-session-mark" aria-hidden="true">&gt;</span>
          <span>
            <span className="m-sr">You: </span>
            done
          </span>
        </p>
        <div className="m-session-tool">
          <p className="m-session-call">
            <span className="m-session-dot" aria-hidden="true" />
            Bash(klef sync)
          </p>
          <p className="m-session-out">
            .env.local in sync
            <br />
            .env.production changed in the vault
            <br />
            <span className="t-ok">Wrote 9 variables to .env.production</span>
          </p>
        </div>
        <p className="m-session-agent">
          <span className="m-session-dot" aria-hidden="true" />
          <span>
            Pulled .env.production from the vault. .env.local was already up
            to date.
          </span>
        </p>
      </div>
    </figure>
  );
}

function SecurityModel() {
  return (
    <section className="m-section" id="security" aria-labelledby="security-title">
      <SectionHead
        id="security-title"
        n="03"
        kicker="Security model"
        title="Encryption happens on your side of the line."
        lead="Your passphrase becomes a key on your device, and files are encrypted there before upload. The server stores what it needs to sync, and nothing that can decrypt it."
      />

      <SecurityBoundary />

      <ul className="m-facts m-facts-grid">
        <Fact title="Signing in does not unlock">
          Google, GitHub or a passkey gets you a session, which reaches
          ciphertext and names. Decrypting needs your passphrase.
        </Fact>
        <Fact title="Stay signed in">
          Sign-in lasts 30 days. The vault locks after 15 idle minutes, or you
          can keep it unlocked on a device you trust, for up to 7 days.
        </Fact>
        <Fact title="No reset, by design">
          A recovery key is shown once at setup. Lose it and the passphrase,
          and the data is gone, because Klef never has the keys.
        </Fact>
        <Fact title="Read the code">
          The crypto lives in small, tested functions under AGPL-3.0, and you
          can self-host to pin the version you audited.
        </Fact>
      </ul>

      <Link to="/security" className="m-link-quiet m-section-more">
        Read the full security model
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </section>
  );
}

function Audit() {
  return (
    <section className="m-section m-band" aria-labelledby="audit-title">
      <div className="m-band-text">
        <p className="m-kicker">
          <span className="m-kicker-n">04</span>Platform audit
        </p>
        <h2 id="audit-title">Know what Vercel, GitHub and Cloudflare are missing.</h2>
        <p className="m-section-lead">
          <code>klef audit</code> compares the key names your platforms hold
          with your local files, through your own <code>vercel</code>,{" "}
          <code>gh</code> and <code>wrangler</code> sign-ins. It is read-only,
          prints names only, and needs no unlock. Klef never writes to those
          platforms.
        </p>
      </div>
      <Terminal title="~/Developer/lensdrop" compact>
        <Cmd>klef audit vercel</Cmd>
        <Out tone="fg">Vercel Production  (.env.production)</Out>
        <Out>  only on Vercel: OLD_FLAG</Out>
        <Out>  only in .env.production: SENTRY_DSN</Out>
        <Out>  in both: 12</Out>
      </Terminal>
    </section>
  );
}

// Category-level and checkable on purpose: no competitor is named, and every
// cell is a property of the kind of tool, including the rows Klef loses.
const COMPARE_COLUMNS = [
  "Klef",
  "Hosted secrets managers",
  "Encrypted .env in git",
  "Pasting into chat or notes",
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
      <SectionHead
        id="compare-title"
        n="05"
        kicker="Compared"
        title="Built for one developer, not a platform team."
        lead="If you need secrets injected into CI, rotated, and shared across a team, a hosted secrets manager is the right tool. Klef gives that up so its server can never read your files."
      />
      <div className="m-table-wrap">
        <table className="m-table">
          <thead>
            <tr>
              <td />
              {COMPARE_COLUMNS.map((c, i) => (
                <th key={c} scope="col" className={i === 0 ? "m-table-us" : undefined}>
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
                  <td key={i} className={i === 0 ? "m-table-us" : undefined}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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
    q: "What if klef.sh goes away?",
    a: (
      <>
        Export any file from the app at any time, or run your own copy. Klef is
        AGPL-3.0 and deploys to your Cloudflare account with Workers and D1.
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
    <section className="m-section" id="faq" aria-labelledby="faq-title">
      <div className="m-faq">
        <SectionHead
          id="faq-title"
          n="06"
          kicker="Questions"
          title="The honest answers."
        />
        <div className="m-faq-list">
          {FAQ.map((item) => (
            <details key={item.q} className="m-faq-item">
              <summary>
                {item.q}
                <span className="m-faq-icon" aria-hidden="true" />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="m-closing" aria-labelledby="closing-title">
      <h2 id="closing-title">
        Stop sending yourself <span className="m-nowrap">.env files.</span>
      </h2>
      <p>
        Free on klef.sh, or on your own Cloudflare account. Either way, whoever
        runs the server cannot read your files.
      </p>
      <div className="m-hero-actions">
        <Link to="/auth" className="m-btn m-btn-primary m-btn-lg">
          Get started free
        </Link>
        <a
          href="https://github.com/BenyD/klef#self-hosting"
          target="_blank"
          rel="noreferrer"
          className="m-link-quiet"
        >
          <GitHubIcon />
          Self-host it
        </a>
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
  lead?: string;
}) {
  return (
    <header className="m-section-head">
      <p className="m-kicker">
        <span className="m-kicker-n">{n}</span>
        {kicker}
      </p>
      <h2 id={id}>{title}</h2>
      {lead && <p className="m-section-lead">{lead}</p>}
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
    <li className="m-step">
      <div className="m-step-text">
        <span className="m-step-n" aria-hidden="true">
          {n}
        </span>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      <Terminal compact>{children}</Terminal>
    </li>
  );
}

function Fact({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="m-fact">
      <h3>{title}</h3>
      <p>{children}</p>
    </li>
  );
}
