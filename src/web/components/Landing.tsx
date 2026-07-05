import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { MarketingLayout, GitHubIcon } from "./MarketingLayout.tsx";

export function Landing() {
  return (
    <MarketingLayout>
      <main className="marketing-hero">
        <a
          href="https://github.com/BenyD/klef/releases"
          target="_blank"
          rel="noreferrer"
          className="marketing-announce"
        >
          <span className="marketing-announce-tag">Beta</span>
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
          <Link to="/about" className="m-btn m-btn-outline">
            Why Klef
          </Link>
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
      </main>
    </MarketingLayout>
  );
}
