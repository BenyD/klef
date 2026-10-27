import type { ReactNode } from "react";
import { Link } from "react-router";
import { MarketingLayout } from "./MarketingLayout.tsx";

// /compare: how Klef stands against the other ways people keep .env files,
// and the questions that come with that. Moved off the landing page so the
// landing stays short.

// Category-level and checkable on purpose: no competitor is named in the
// table, and every cell is a property of the kind of tool, including the rows
// Klef loses.
const COLUMNS = ["Klef", "Hosted secrets managers", "Encrypted .env in git", "Pasting into chat"] as const;

const ROWS: { label: string; cells: [string, string, string, string] }[] = [
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

export function Compare() {
  return (
    <MarketingLayout>
      <main className="m-main">
        <header className="m-wrap m-page-head">
          <p className="m-label">Compare</p>
          <h1>Built for one developer, not a platform team.</h1>
          <p className="m-lede" style={{ fontSize: 18 }}>
            If you need secrets injected into CI, rotated and shared across a
            team, a hosted secrets manager is the right tool. Klef gives that
            up so its server can never read your files.
          </p>
        </header>

        <section className="m-wrap" aria-label="Comparison">
          <div className="m-table-wrap">
            <table className="m-table">
              <thead>
                <tr>
                  <td />
                  {COLUMNS.map((c, i) => (
                    <th key={c} scope="col" className={i === 0 ? "m-us" : undefined}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
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
        </section>

        <section className="m-wrap m-section" aria-labelledby="faq-title" style={{ paddingBottom: 96 }}>
          <h2 id="faq-title" className="m-h2" style={{ marginBottom: 24 }}>
            Questions
          </h2>
          <div className="m-faq">
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
          <div className="m-actions-row" style={{ marginTop: 32 }}>
            <Link to="/auth" className="m-btn m-btn-ink">
              Get started free <span className="m-arrow" aria-hidden="true">&#8594;</span>
            </Link>
            <Link to="/security" className="m-btn m-btn-line">
              Read the security model
            </Link>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}
