import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { MarketingLayout, GitHubIcon } from "./MarketingLayout.tsx";
import { AgentPrompts, CopyPromptButton } from "./AgentPrompts.tsx";
import { DEFAULT_PROMPT } from "../lib/agent-prompts.ts";

export function Landing() {
  return (
    <MarketingLayout>
      <main className="marketing-main">
        <section className="marketing-hero">
          <a
            href="https://github.com/BenyD/klef/releases"
            target="_blank"
            rel="noreferrer"
            className="marketing-announce"
          >
            {/* Keep the space after the pill: without it text extractors
                (e.g. Google snippets) read "BetaKlef"; flex gap hides it. */}
            <span className="marketing-announce-tag">Beta</span>{" "}
            Klef is in early access
            <ArrowRight className="marketing-announce-arrow size-3.5" />
          </a>

          <h1>Sync your .env files without trusting the server</h1>

          <p>
            Store your environment files in one place and pull them down on any
            machine. Everything is{" "}
            <Link to="/security" className="marketing-inline-link">
              encrypted in your browser
            </Link>{" "}
            before it leaves.
          </p>

          <div className="marketing-cta">
            <Link to="/auth" className="m-btn m-btn-primary">
              Get started
            </Link>
            <CopyPromptButton
              prompt={DEFAULT_PROMPT}
              className="m-btn m-btn-outline"
            >
              Copy agent prompt
            </CopyPromptButton>
          </div>

          <div className="marketing-window">
            <div className="marketing-window-bar">
              <div className="dots">
                <span />
                <span />
                <span />
              </div>
              <span className="marketing-window-name">.env.local</span>
            </div>
            <pre className="marketing-code">
              <div className="line">
                <span className="gutter"> </span>
                <span className="ctx">DATABASE_URL=postgres://localhost/app</span>
              </div>
              <div className="line">
                <span className="gutter rem">-</span>
                <span className="rem">API_KEY=sk_test_51H8xQ2</span>
              </div>
              <div className="line">
                <span className="gutter add">+</span>
                <span className="add">API_KEY=sk_live_92Fk1p</span>
              </div>
              <div className="line">
                <span className="gutter"> </span>
                <span className="ctx">REDIS_URL=redis://localhost:6379</span>
              </div>
            </pre>
          </div>

          <a
            href="https://github.com/BenyD/klef"
            target="_blank"
            rel="noreferrer"
            className="marketing-oss"
          >
            <GitHubIcon />
            Open source and self-hostable
          </a>
        </section>

        <HowItWorks />
        <AgentPrompts />
      </main>
    </MarketingLayout>
  );
}

// The "what we do" pass, directly under the hero: the hero states the promise,
// this states the mechanism. Deliberately three steps — paste, review, pull —
// because that is the entire loop.
function HowItWorks() {
  return (
    <section className="marketing-section">
      <h2>What Klef does</h2>
      <p className="marketing-section-lead">
        One place for the .env files that currently live in chat messages to
        yourself, and a way to get them onto the next machine.
      </p>

      <ol className="marketing-steps">
        <li>
          <span className="marketing-step-n">1</span>
          <h3>Paste it in</h3>
          <p>
            Drop an env file into Klef. It is encrypted in your browser with
            AES-256-GCM before a single byte leaves, under a key derived from a
            passphrase we never receive.
          </p>
        </li>
        <li>
          <span className="marketing-step-n">2</span>
          <h3>Review the diff</h3>
          <p>
            Pasting an updated file shows a line-level diff against the stored
            version, computed on your machine, on text the server cannot read.
            Every save keeps the old one.
          </p>
        </li>
        <li>
          <span className="marketing-step-n">3</span>
          <h3>Pull it down anywhere</h3>
          <p>
            New laptop, new OS, same files. Sign in, unlock with your
            passphrase, and copy them back — no hunting through old messages.
          </p>
        </li>
      </ol>
    </section>
  );
}
