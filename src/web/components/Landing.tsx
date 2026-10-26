import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { MarketingLayout, GitHubIcon } from "./MarketingLayout.tsx";
import { AgentPrompts } from "./AgentPrompts.tsx";

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
        <Closing />
      </main>
    </MarketingLayout>
  );
}

function Hero() {
  return (
    <section className="m-hero">
      <div className="m-hero-head">
        <p className="m-eyebrow">
          <span className="m-eyebrow-dot" aria-hidden="true" />
          Works with Claude Code and Cursor
        </p>
        <h1>Your .env files, encrypted and in sync</h1>
      </div>
      <div className="m-hero-copy">
        <p className="m-hero-lead">
          Klef keeps <code>.env.local</code> and <code>.env.production</code>{" "}
          the same on every machine you work on. They are{" "}
          <span className="m-nowrap">end-to-end</span> encrypted, so the server never sees a value. The CLI never prints
          one either, which makes it safe to hand to your agent.
        </p>
        <div className="m-hero-actions">
          <Link to="/auth" className="m-btn m-btn-primary">
            Get started free
          </Link>
          <a href="#how-it-works" className="m-link-quiet">
            See how it works
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </a>
        </div>
        <p className="m-hero-note">
          Open source under AGPL-3.0. Self-host it on your own Cloudflare
          account.
        </p>
      </div>

      <Terminal title="~/Developer/lensdrop" className="m-hero-terminal">
        <Cmd>klef sync</Cmd>
        <Out>.env.local       edited here</Out>
        <Out>.env.production  changed in the vault</Out>
        <Out>About to push .env.local: 14 variables (+1 lines)</Out>
        <Out>
          Push? [y/N] <span className="t-fg">y</span>
        </Out>
        <Out tone="ok">Pushed 14 variables (+1 lines) to .env.local (version 3f9a2c1d).</Out>
        <Out tone="ok">Wrote 9 variables to .env.production</Out>
      </Terminal>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="m-section" id="how-it-works" aria-labelledby="how-title">
      <SectionHead
        id="how-title"
        kicker="How it works"
        title="One command per repo, one per new machine"
        lead="Link a repo once and every env file in it follows you. Sync decides which side changed, and stops for you when both did."
      />

      <ol className="m-steps">
        <Step
          n={1}
          title="Connect a repo"
          body="Signs this machine in, links the repo to a project in your vault, teaches your agents, and pulls the files that are missing. Rerun it any time: it skips what is done."
        >
          <Cmd>npx @klefsh/cli setup</Cmd>
          <Out>Step 1 of 4: signed in as you@example.com.</Out>
          <Out>
            Step 2 of 4: linked to personal / lensdrop (2 files). Wrote
            .klef.json, which is safe to commit.
          </Out>
          <Out>Step 3 of 4: instructions for Claude Code and Cursor.</Out>
          <Out>  Create  ./.claude/skills/klef/SKILL.md</Out>
          <Out>  Create  ./.cursor/rules/klef.mdc</Out>
          <Out>
            Write 2 files? [y/N] <span className="t-fg">y</span>
          </Out>
          <Out>Step 4 of 4: pull .env.local, .env.production.</Out>
        </Step>
        <Step
          n={2}
          title="Keep it in sync"
          body="Pushes what you edited here and pulls what changed in the vault. If a file changed on both sides, it shows which keys differ and writes nothing."
        >
          <Cmd>klef sync</Cmd>
          <Out>.env.local       in sync</Out>
          <Out>.env.production  changed in the vault</Out>
          <Out tone="ok">Wrote 9 variables to .env.production</Out>
        </Step>
        <Step
          n={3}
          title="Restore a new Mac"
          body="Clone your repos, then point restore at the folder. It lists every linked checkout, asks before it decrypts anything, and only ever pulls."
        >
          <Cmd>klef restore ~/Developer</Cmd>
          <Out>Linked checkouts under /Users/you/Developer:</Out>
          <Out>  lensdrop  personal / lensdrop  (.env.local, .env.production)</Out>
          <Out>  klef  personal / klef  (.env.local, .env.production)</Out>
          <Out>
            Restore these 2? [y/N] <span className="t-fg">y</span>
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
        kicker="For your agent"
        title="Safe to hand to Claude Code and Cursor"
        lead="Setup writes a Claude Code skill and a Cursor rule into the repo, so every new session already knows how to sync, and knows never to print a value. Your agent runs the commands. You type the passphrase."
      />

      <div className="m-agent-grid">
        <ul className="m-facts">
          <Fact title="It never prints a secret">
            There is no <code>klef get</code> and no <code>--print</code>.{" "}
            <code>pull</code> writes the file at mode 0600 and reports a count.{" "}
            <code>diff</code> and <code>sync</code> name keys, never values.
          </Fact>
          <Fact title="Your agent never sees the passphrase">
            The CLI reads it from your terminal, not from stdin, a flag, or an
            environment variable. <code>klef unlock</code> covers the next
            commands, then locks after 15 idle minutes.
          </Fact>
          <Fact title="It stays inside the repo">
            <code>pull</code> and <code>push</code> refuse absolute paths and{" "}
            <code>../</code>, so an agent cannot choose where plaintext lands.
          </Fact>
        </ul>

        <div className="m-audit">
          <h3>Check your platforms</h3>
          <p>
            <code>klef audit</code> compares key names on Vercel, GitHub and
            Cloudflare with your local files, using your own CLI sign-ins. It
            is read-only and prints names only. Klef never writes to those
            platforms.
          </p>
          <Terminal title="audit" compact>
            <Cmd>klef audit vercel</Cmd>
            <Out>Vercel Production  (.env.production)</Out>
            <Out>  only on Vercel: OLD_FLAG</Out>
            <Out>  only in .env.production: SENTRY_DSN</Out>
            <Out>  in both: 12</Out>
          </Terminal>
        </div>
      </div>

      <AgentPrompts />
    </section>
  );
}

function SecurityModel() {
  return (
    <section className="m-section" id="security" aria-labelledby="security-title">
      <SectionHead
        id="security-title"
        kicker="Security model"
        title="The server never sees a value"
        lead="Encryption happens in your browser or the CLI, before anything is uploaded. A full copy of Klef's database holds your account, the names of your projects and files, and ciphertext. Nothing in it decrypts a file."
      />

      <div className="m-flow" aria-hidden="true">
        <div className="m-flow-box">
          <span className="m-flow-label">On your machine, readable by you</span>
          <code>DATABASE_URL=•••••••</code>
          <code>STRIPE_KEY=•••••••</code>
        </div>
        <div className="m-flow-arrow">
          <span>AES-256-GCM</span>
        </div>
        <div className="m-flow-box">
          <span className="m-flow-label">On the server, ciphertext only</span>
          <code>9f2kQx0mL1vB7sTn4wE8...</code>
          <code>Zp3uRc6yH0aK5dJq2gW1...</code>
        </div>
      </div>

      <ul className="m-facts m-facts-grid">
        <Fact title="Your passphrase is the key">
          Argon2id turns it into a key on your device. The passphrase is
          never sent, and the server holds only a wrapped copy of your data
          key.
        </Fact>
        <Fact title="Signing in does not unlock">
          Google, GitHub or a passkey gets you a session, which reaches
          ciphertext and names. Decrypting needs your passphrase, on your device.
        </Fact>
        <Fact title="Stay signed in">
          Sign-in lasts 30 days. The vault locks after 15 idle minutes, or you
          can keep it unlocked on a device you trust, for up to 7 days.
        </Fact>
        <Fact title="No reset, by design">
          A recovery key is shown once at setup. Lose it and the passphrase,
          and the data is gone, because Klef never has the keys.
        </Fact>
      </ul>

      <Link to="/security" className="m-link-quiet m-section-more">
        Read the full security model
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </section>
  );
}

function Closing() {
  return (
    <section className="m-closing" aria-labelledby="closing-title">
      <h2 id="closing-title">Free, open source, and yours to host</h2>
      <p>
        Use klef.sh for free, or run your own copy on Cloudflare Workers and
        D1. Either way, whoever runs the server cannot read your files.
      </p>
      <div className="m-hero-actions">
        <Link to="/auth" className="m-btn m-btn-primary">
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
  kicker,
  title,
  lead,
}: {
  id: string;
  kicker: string;
  title: string;
  lead: string;
}) {
  return (
    <header className="m-section-head">
      <p className="m-kicker">{kicker}</p>
      <h2 id={id}>{title}</h2>
      <p className="m-section-lead">{lead}</p>
    </header>
  );
}

function Step({
  n,
  title,
  body,
  children,
}: {
  n: number;
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

/**
 * A terminal transcript. Rendered as a figure with real text so it reads
 * (and copies) as text, and screen readers get it in order.
 */
function Terminal({
  title,
  compact,
  className,
  children,
}: {
  title?: string;
  compact?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <figure
      className={["m-term", compact && "m-term-compact", className]
        .filter(Boolean)
        .join(" ")}
    >
      {title && (
        <figcaption className="m-term-bar">
          <span className="m-term-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="m-term-title">{title}</span>
        </figcaption>
      )}
      <pre className="m-term-body">{children}</pre>
    </figure>
  );
}

function Cmd({ children }: { children: ReactNode }) {
  return (
    <span className="t-line">
      <span className="t-prompt" aria-hidden="true">
        ${" "}
      </span>
      <span className="t-fg">{children}</span>
    </span>
  );
}

function Out({ tone, children }: { tone?: "ok"; children: ReactNode }) {
  return <span className={tone === "ok" ? "t-line t-ok" : "t-line"}>{children}</span>;
}
